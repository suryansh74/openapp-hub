package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const MaxUploadBytes = 1 << 20 // 1 MB

type User struct {
	ID        string         `json:"id" gorm:"primaryKey"`
	Email     string         `json:"email" gorm:"uniqueIndex;not null"`
	Username  string         `json:"username" gorm:"index"` // lowercase handle; uniqueness enforced in app (empty allowed for incomplete profiles)
	Name      string         `json:"name"`                        // display name (not unique)
	AvatarURL string         `json:"avatar_url"`
	Bio       string         `json:"bio"`
	Links     datatypes.JSON `json:"links" gorm:"type:jsonb;default:'[]'"`
	Provider  string         `json:"provider"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

type App struct {
	ID              string         `json:"id" gorm:"primaryKey"`
	Name            string         `json:"name" gorm:"not null"`
	Problem         string         `json:"problem" gorm:"not null"`
	Significance    string         `json:"significance"`
	HowToUse        string         `json:"how_to_use"`
	DownloadURL     string         `json:"download_url"`
	IconURL         string         `json:"icon_url"`
	Screenshots     datatypes.JSON `json:"screenshots" gorm:"type:jsonb;default:'[]'"` // []string
	YoutubeURL      string         `json:"youtube_url"`
	Links           datatypes.JSON `json:"links" gorm:"type:jsonb;default:'[]'"` // [{label,url,note}]
	Publisher         string         `json:"publisher"`
	PublisherAvatar   string         `json:"publisher_avatar"`
	PublisherUsername string         `json:"publisher_username"`
	UserID            string         `json:"user_id" gorm:"index"`
	LikesCount      int            `json:"likes_count" gorm:"default:0"`
	DislikesCount   int            `json:"dislikes_count" gorm:"default:0"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

type Comment struct {
	ID            string    `json:"id" gorm:"primaryKey"`
	AppID         string    `json:"app_id" gorm:"index;not null"`
	UserID        string    `json:"user_id" gorm:"index"`
	ParentID      *string   `json:"parent_id" gorm:"index"` // nil = top-level
	Content       string    `json:"content" gorm:"not null"`
	AuthorName    string    `json:"author_name"`
	AuthorAvatar  string    `json:"author_avatar"`
	LikesCount    int       `json:"likes_count" gorm:"default:0"`
	DislikesCount int       `json:"dislikes_count" gorm:"default:0"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Vote tracks user likes/dislikes on apps or comments
// TargetType: "app" | "comment"
// Unique per (user_email, target_type, target_id)
type Vote struct {
	ID         string    `json:"id" gorm:"primaryKey"`
	UserEmail  string    `json:"user_email" gorm:"uniqueIndex:idx_vote_user_target;not null"`
	TargetType string    `json:"target_type" gorm:"uniqueIndex:idx_vote_user_target;not null"`
	TargetID   string    `json:"target_id" gorm:"uniqueIndex:idx_vote_user_target;not null"`
	Value      int       `json:"value"` // 1 = like, -1 = dislike
	CreatedAt  time.Time `json:"created_at"`
}

type BacklogItem struct {
	ID          string         `json:"id" gorm:"primaryKey"`
	Title       string         `json:"title" gorm:"not null"`
	Description string         `json:"description"`
	Category    string         `json:"category"`
	Priority    string         `json:"priority"`
	Status      string         `json:"status" gorm:"default:reserved"`
	Stage       string         `json:"stage"`
	Done        bool           `json:"done" gorm:"default:false"`
	Meta        datatypes.JSON `json:"meta" gorm:"type:jsonb;default:'{}'"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

var db *gorm.DB
var cld *cloudinary.Cloudinary

// --- Simple in-memory rate limiter (per IP, fixed window) ---
// Why: free-tier API is easy to abuse (spam votes, flood search, burn Cloudinary/DB).
// Limits are intentionally modest for Stage 1; can move to Redis later.

type rateBucket struct {
	count   int
	resetAt time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*rateBucket
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		visitors: make(map[string]*rateBucket),
		limit:    limit,
		window:   window,
	}
	go func() {
		for {
			time.Sleep(time.Minute)
			rl.mu.Lock()
			now := time.Now()
			for k, b := range rl.visitors {
				if now.After(b.resetAt) {
					delete(rl.visitors, k)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(key string) (ok bool, remaining int, retryAfter time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	b, exists := rl.visitors[key]
	if !exists || now.After(b.resetAt) {
		rl.visitors[key] = &rateBucket{count: 1, resetAt: now.Add(rl.window)}
		return true, rl.limit - 1, 0
	}
	if b.count >= rl.limit {
		return false, 0, b.resetAt.Sub(now)
	}
	b.count++
	return true, rl.limit - b.count, 0
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		return host[:i]
	}
	return host
}

// General API: 120 requests / minute / IP
var limitGeneral = newRateLimiter(120, time.Minute)

// Write-heavy: votes, comments, publish, upload — 30 / minute / IP
var limitWrite = newRateLimiter(30, time.Minute)

// Search: slightly tighter — 60 / minute / IP (pagination multiplies calls)
var limitSearch = newRateLimiter(60, time.Minute)

func applyRateLimit(w http.ResponseWriter, r *http.Request, lim *rateLimiter) bool {
	ok, remaining, retry := lim.allow(clientIP(r))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
	if !ok {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":       "rate limit exceeded",
			"retry_after": int(retry.Seconds()) + 1,
		})
		return false
	}
	return true
}

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func parseScreenshots(raw datatypes.JSON) []string {
	var out []string
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	if out == nil {
		out = []string{}
	}
	return out
}

func listApps(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	// Search/list is public and easy to hammer — use search limiter
	if !applyRateLimit(w, r, limitSearch) {
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 {
		limit = 12
	}
	if limit > 50 {
		limit = 50
	}
	offset := (page - 1) * limit

	query := db.Model(&App{})
	if q != "" {
		like := "%" + strings.ToLower(q) + "%"
		query = query.Where(
			"LOWER(name) LIKE ? OR LOWER(problem) LIKE ? OR LOWER(COALESCE(significance,'')) LIKE ? OR LOWER(COALESCE(publisher,'')) LIKE ?",
			like, like, like, like,
		)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		http.Error(w, "failed to count apps", http.StatusInternalServerError)
		return
	}

	var apps []App
	if err := query.Order("created_at desc").Offset(offset).Limit(limit).Find(&apps).Error; err != nil {
		http.Error(w, "failed to fetch apps", http.StatusInternalServerError)
		return
	}
	if apps == nil {
		apps = []App{}
	}

	totalPages := int(total) / limit
	if int(total)%limit != 0 {
		totalPages++
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"items":       apps,
		"page":        page,
		"limit":       limit,
		"total":       total,
		"total_pages": totalPages,
		"q":           q,
	})
}

func getApp(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/apps/")
	id = strings.Split(id, "/")[0]
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	var app App
	if err := db.First(&app, "id = ?", id).Error; err != nil {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
}

func createApp(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !applyRateLimit(w, r, limitWrite) {
		return
	}

	var input struct {
		Name            string   `json:"name"`
		Problem         string   `json:"problem"`
		Significance    string   `json:"significance"`
		HowToUse        string   `json:"how_to_use"`
		DownloadURL     string   `json:"download_url"`
		IconURL         string   `json:"icon_url"`
		Screenshots     []string                 `json:"screenshots"`
		YoutubeURL      string                   `json:"youtube_url"`
		Links           []map[string]interface{} `json:"links"`
		Publisher       string                   `json:"publisher"`
		PublisherAvatar string                   `json:"publisher_avatar"`
		UserEmail       string                   `json:"user_email"`
		UserName        string                   `json:"user_name"`
		UserAvatar      string                   `json:"user_avatar"`
		Provider        string                   `json:"provider"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Name == "" || input.Problem == "" {
		http.Error(w, "name and problem are required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	userID := ""
	publisherUsername := ""
	if input.UserEmail != "" {
		var user User
		err := db.Where("email = ?", input.UserEmail).First(&user).Error
		if err == gorm.ErrRecordNotFound {
			// New user — do not steal OAuth name as permanent identity; username set on /profile
			user = User{
				ID: uuid.New().String(), Email: input.UserEmail,
				Name: input.UserName, AvatarURL: input.UserAvatar,
				Provider: input.Provider, CreatedAt: now, UpdatedAt: now,
			}
			db.Create(&user)
		} else if err == nil {
			// Existing user: never overwrite their OpenApp Hub profile with OAuth payload
			// Only fill empty name/avatar from OAuth if still blank
			updates := map[string]interface{}{"updated_at": now}
			if user.Name == "" && input.UserName != "" {
				updates["name"] = input.UserName
			}
			if user.AvatarURL == "" && input.UserAvatar != "" {
				updates["avatar_url"] = input.UserAvatar
			}
			if len(updates) > 1 {
				db.Model(&user).Updates(updates)
				db.First(&user, "id = ?", user.ID)
			}
		}
		userID = user.ID
		// Publisher identity always from OpenApp Hub user record
		publisherUsername = user.Username
		if user.AvatarURL != "" {
			input.PublisherAvatar = user.AvatarURL
		}
		// Prefer @username as public publisher label when set
		if user.Username != "" {
			input.Publisher = user.Username
		} else if user.Name != "" {
			input.Publisher = user.Name
		}
	}

	ss, _ := json.Marshal(input.Screenshots)
	if input.Screenshots == nil {
		ss = []byte("[]")
	}
	lk, _ := json.Marshal(input.Links)
	if input.Links == nil {
		lk = []byte("[]")
	}

	app := App{
		ID: uuid.New().String(), Name: input.Name, Problem: input.Problem, Significance: input.Significance,
		HowToUse: input.HowToUse, DownloadURL: input.DownloadURL, IconURL: input.IconURL,
		Screenshots: datatypes.JSON(ss), YoutubeURL: input.YoutubeURL, Links: datatypes.JSON(lk),
		Publisher: input.Publisher, PublisherAvatar: input.PublisherAvatar,
		PublisherUsername: publisherUsername, UserID: userID,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := db.Create(&app).Error; err != nil {
		http.Error(w, "failed to create app", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(app)
}

func updateApp(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPatch && r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !applyRateLimit(w, r, limitWrite) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/apps/")
	id = strings.Split(id, "/")[0]
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	var app App
	if err := db.First(&app, "id = ?", id).Error; err != nil {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}

	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// Owner-only: require user_email and match app.UserID
	email, _ := input["user_email"].(string)
	email = strings.TrimSpace(email)
	if email == "" {
		http.Error(w, "user_email required", http.StatusUnauthorized)
		return
	}
	var user User
	if err := db.Where("email = ?", email).First(&user).Error; err != nil {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}
	if app.UserID == "" || app.UserID != user.ID {
		http.Error(w, "only the publisher can edit this app", http.StatusForbidden)
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now().UTC()}
	for _, key := range []string{"name", "problem", "significance", "how_to_use", "download_url", "icon_url", "youtube_url"} {
		if v, ok := input[key]; ok {
			updates[key] = v
		}
	}
	// Keep publisher label in sync with Hub profile (do not accept arbitrary publisher takeover)
	if user.Username != "" {
		updates["publisher"] = "@" + user.Username
		updates["publisher_username"] = user.Username
	} else if user.Name != "" {
		updates["publisher"] = user.Name
	}
	if user.AvatarURL != "" {
		updates["publisher_avatar"] = user.AvatarURL
	}
	if v, ok := input["screenshots"]; ok {
		b, _ := json.Marshal(v)
		updates["screenshots"] = datatypes.JSON(b)
	}
	if v, ok := input["links"]; ok {
		b, _ := json.Marshal(v)
		updates["links"] = datatypes.JSON(b)
	}

	if err := db.Model(&app).Updates(updates).Error; err != nil {
		http.Error(w, "failed to update", http.StatusInternalServerError)
		return
	}
	db.First(&app, "id = ?", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
}

func deleteApp(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !applyRateLimit(w, r, limitWrite) {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/apps/")
	id = strings.Split(id, "/")[0]
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(r.URL.Query().Get("user_email"))
	if email == "" {
		var body struct {
			UserEmail string `json:"user_email"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		email = strings.TrimSpace(body.UserEmail)
	}
	var app App
	if err := db.First(&app, "id = ?", id).Error; err != nil {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}
	// Owned apps: require matching publisher. Orphans (empty user_id): allow delete for catalog cleanup.
	if app.UserID != "" {
		if email == "" {
			http.Error(w, "user_email required", http.StatusUnauthorized)
			return
		}
		var user User
		if err := db.Where("email = ?", email).First(&user).Error; err != nil {
			http.Error(w, "user not found", http.StatusUnauthorized)
			return
		}
		if app.UserID != user.ID {
			http.Error(w, "only the publisher can delete this app", http.StatusForbidden)
			return
		}
	}

	// Collect comments for this app, delete votes, comments, then app
	var commentIDs []string
	db.Model(&Comment{}).Where("app_id = ?", id).Pluck("id", &commentIDs)
	if len(commentIDs) > 0 {
		db.Where("target_type = ? AND target_id IN ?", "comment", commentIDs).Delete(&Vote{})
		db.Where("app_id = ?", id).Delete(&Comment{})
	}
	db.Where("target_type = ? AND target_id = ?", "app", id).Delete(&Vote{})
	if err := db.Delete(&app).Error; err != nil {
		http.Error(w, "failed to delete app", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "id": id})
}

// --- Votes (like / dislike) ---

func voteHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet && !applyRateLimit(w, r, limitWrite) {
		return
	}
	if r.Method == http.MethodGet && !applyRateLimit(w, r, limitGeneral) {
		return
	}

	// GET /api/vote?user_email=...&app_id=...
	// Returns map of "app:<id>" or "comment:<id>" -> 1 | -1 for this user's votes
	if r.Method == http.MethodGet {
		email := r.URL.Query().Get("user_email")
		appID := r.URL.Query().Get("app_id")
		if email == "" {
			http.Error(w, "user_email required", http.StatusBadRequest)
			return
		}
		var votes []Vote
		q := db.Where("user_email = ?", email)
		if appID != "" {
			// app vote + all comment votes for comments on this app
			var commentIDs []string
			db.Model(&Comment{}).Where("app_id = ?", appID).Pluck("id", &commentIDs)
			ids := append([]string{appID}, commentIDs...)
			q = q.Where("target_id IN ?", ids)
		}
		if err := q.Find(&votes).Error; err != nil {
			http.Error(w, "failed to fetch votes", http.StatusInternalServerError)
			return
		}
		out := map[string]int{}
		for _, v := range votes {
			out[v.TargetType+":"+v.TargetID] = v.Value
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var input struct {
		UserEmail  string `json:"user_email"`
		TargetType string `json:"target_type"` // app | comment
		TargetID   string `json:"target_id"`
		Value      int    `json:"value"` // 1 or -1
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.UserEmail == "" || input.TargetID == "" || (input.Value != 1 && input.Value != -1) {
		http.Error(w, "user_email, target_id and value (1|-1) required", http.StatusBadRequest)
		return
	}
	if input.TargetType != "app" && input.TargetType != "comment" {
		http.Error(w, "target_type must be app or comment", http.StatusBadRequest)
		return
	}

	var existing Vote
	err := db.Where("user_email = ? AND target_type = ? AND target_id = ?", input.UserEmail, input.TargetType, input.TargetID).First(&existing).Error

	now := time.Now().UTC()

	if err == gorm.ErrRecordNotFound {
		// new vote
		v := Vote{ID: uuid.New().String(), UserEmail: input.UserEmail, TargetType: input.TargetType, TargetID: input.TargetID, Value: input.Value, CreatedAt: now}
		db.Create(&v)
		applyVoteDelta(input.TargetType, input.TargetID, input.Value, 0)
	} else if err == nil {
		if existing.Value == input.Value {
			// toggle off — remove the existing vote
			db.Delete(&existing)
			applyVoteDelta(input.TargetType, input.TargetID, 0, existing.Value)
		} else {
			// switch like <-> dislike
			old := existing.Value
			db.Model(&existing).Update("value", input.Value)
			applyVoteDelta(input.TargetType, input.TargetID, input.Value, old)
		}
	}

	// return updated counts + current user vote (0 if removed)
	myVote := 0
	var check Vote
	if err := db.Where("user_email = ? AND target_type = ? AND target_id = ?", input.UserEmail, input.TargetType, input.TargetID).First(&check).Error; err == nil {
		myVote = check.Value
	}
	if input.TargetType == "app" {
		var app App
		db.First(&app, "id = ?", input.TargetID)
		json.NewEncoder(w).Encode(map[string]int{"likes_count": app.LikesCount, "dislikes_count": app.DislikesCount, "my_vote": myVote})
	} else {
		var c Comment
		db.First(&c, "id = ?", input.TargetID)
		json.NewEncoder(w).Encode(map[string]int{"likes_count": c.LikesCount, "dislikes_count": c.DislikesCount, "my_vote": myVote})
	}
}

func applyVoteDelta(targetType, targetID string, newVal, oldVal int) {
	deltaLike, deltaDislike := 0, 0
	if oldVal == 1 {
		deltaLike--
	}
	if oldVal == -1 {
		deltaDislike--
	}
	if newVal == 1 {
		deltaLike++
	}
	if newVal == -1 {
		deltaDislike++
	}

	if targetType == "app" {
		db.Model(&App{}).Where("id = ?", targetID).Updates(map[string]interface{}{
			"likes_count":    gorm.Expr("likes_count + ?", deltaLike),
			"dislikes_count": gorm.Expr("dislikes_count + ?", deltaDislike),
		})
	} else {
		db.Model(&Comment{}).Where("id = ?", targetID).Updates(map[string]interface{}{
			"likes_count":    gorm.Expr("likes_count + ?", deltaLike),
			"dislikes_count": gorm.Expr("dislikes_count + ?", deltaDislike),
		})
	}
}

// --- Comments ---

func listComments(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	appID := r.URL.Query().Get("app_id")
	if appID == "" {
		http.Error(w, "app_id required", http.StatusBadRequest)
		return
	}
	var comments []Comment
	if err := db.Where("app_id = ?", appID).Order("created_at asc").Find(&comments).Error; err != nil {
		http.Error(w, "failed to fetch comments", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}

func createComment(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if !applyRateLimit(w, r, limitWrite) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var input struct {
		AppID        string  `json:"app_id"`
		ParentID     *string `json:"parent_id"`
		Content      string  `json:"content"`
		UserEmail    string  `json:"user_email"`
		AuthorName   string  `json:"author_name"`
		AuthorAvatar string  `json:"author_avatar"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.AppID == "" || strings.TrimSpace(input.Content) == "" {
		http.Error(w, "app_id and content required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	userID := ""
	if input.UserEmail != "" {
		var user User
		if err := db.Where("email = ?", input.UserEmail).First(&user).Error; err == nil {
			userID = user.ID
			if input.AuthorName == "" {
				input.AuthorName = user.Name
			}
			if input.AuthorAvatar == "" {
				input.AuthorAvatar = user.AvatarURL
			}
		}
	}

	c := Comment{
		ID: uuid.New().String(), AppID: input.AppID, UserID: userID, ParentID: input.ParentID,
		Content: strings.TrimSpace(input.Content), AuthorName: input.AuthorName, AuthorAvatar: input.AuthorAvatar,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := db.Create(&c).Error; err != nil {
		http.Error(w, "failed to create comment", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}


func updateComment(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPatch && r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/comments/")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	var c Comment
	if err := db.First(&c, "id = ?", id).Error; err != nil {
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}
	var input struct {
		Content   string `json:"content"`
		UserEmail string `json:"user_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(input.Content) == "" {
		http.Error(w, "content required", http.StatusBadRequest)
		return
	}
	// Optional ownership check via email if provided
	if input.UserEmail != "" {
		var user User
		if err := db.Where("email = ?", input.UserEmail).First(&user).Error; err == nil {
			if c.UserID != "" && c.UserID != user.ID {
				http.Error(w, "not authorized", http.StatusForbidden)
				return
			}
		}
	}
	db.Model(&c).Updates(map[string]interface{}{
		"content":    strings.TrimSpace(input.Content),
		"updated_at": time.Now().UTC(),
	})
	db.First(&c, "id = ?", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func deleteComment(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/comments/")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	var c Comment
	if err := db.First(&c, "id = ?", id).Error; err != nil {
		http.Error(w, "comment not found", http.StatusNotFound)
		return
	}

	// Collect entire reply subtree (any depth), then delete all
	toDelete := []string{id}
	queue := []string{id}
	for len(queue) > 0 {
		parent := queue[0]
		queue = queue[1:]
		var children []Comment
		db.Where("parent_id = ?", parent).Find(&children)
		for _, ch := range children {
			toDelete = append(toDelete, ch.ID)
			queue = append(queue, ch.ID)
		}
	}

	db.Where("id IN ?", toDelete).Delete(&Comment{})
	db.Where("target_type = ? AND target_id IN ?", "comment", toDelete).Delete(&Vote{})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "deleted",
		"deleted_count": len(toDelete),
	})
}

// --- Upload (Cloudinary, max 1MB) ---

func uploadImage(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if !applyRateLimit(w, r, limitWrite) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if cld == nil {
		http.Error(w, "cloudinary not configured — set CLOUDINARY_URL on the API service and redeploy", http.StatusServiceUnavailable)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, MaxUploadBytes+512)
	if err := r.ParseMultipartForm(MaxUploadBytes + 512); err != nil {
		http.Error(w, "file too large (max 1MB)", http.StatusRequestEntityTooLarge)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > MaxUploadBytes {
		http.Error(w, "file too large (max 1MB)", http.StatusRequestEntityTooLarge)
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read file", http.StatusInternalServerError)
		return
	}
	if len(data) > MaxUploadBytes {
		http.Error(w, "file too large (max 1MB)", http.StatusRequestEntityTooLarge)
		return
	}

	resp, err := cld.Upload.Upload(r.Context(), bytes.NewReader(data), uploader.UploadParams{
		Folder:         "openapp-hub",
		UniqueFilename: api.Bool(true),
		Overwrite:      api.Bool(false),
	})
	if err != nil {
		log.Println("cloudinary upload error:", err)
		http.Error(w, "upload failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": resp.SecureURL})
}

// --- Users / username ---

var reservedUsernames = map[string]bool{
	"admin": true, "api": true, "login": true, "logout": true, "signup": true,
	"register": true, "publish": true, "profile": true, "settings": true,
	"help": true, "support": true, "about": true, "openapp": true, "openapphub": true,
	"root": true, "null": true, "me": true, "u": true, "app": true, "apps": true,
	"auth": true, "oauth": true, "callback": true, "health": true, "public": true,
	"static": true, "assets": true, "favicon": true, "robots": true,
}

func normalizeUsername(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func validUsernameFormat(u string) bool {
	if len(u) < 3 || len(u) > 30 {
		return false
	}
	for i, c := range u {
		if c >= 'a' && c <= 'z' {
			continue
		}
		if c >= '0' && c <= '9' {
			continue
		}
		if c == '_' && i > 0 {
			continue
		}
		return false
	}
	return true
}

func isUsernameAvailable(username, exceptUserID string) (bool, string) {
	u := normalizeUsername(username)
	if !validUsernameFormat(u) {
		return false, "Username must be 3–30 chars: a-z, 0-9, underscore (not starting with _)"
	}
	if reservedUsernames[u] {
		return false, "This username is reserved"
	}
	var existing User
	q := db.Where("username = ?", u)
	if exceptUserID != "" {
		q = q.Where("id <> ?", exceptUserID)
	}
	err := q.First(&existing).Error
	if err == nil {
		return false, "Username is already taken"
	}
	return true, ""
}

func checkUsername(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u := normalizeUsername(r.URL.Query().Get("u"))
	except := r.URL.Query().Get("except_user_id")
	ok, reason := isUsernameAvailable(u, except)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"username":  u,
		"available": ok,
		"reason":    reason,
	})
}

// publicUser strips email for public responses
func publicUser(u User) map[string]interface{} {
	var links interface{}
	if len(u.Links) > 0 {
		_ = json.Unmarshal(u.Links, &links)
	}
	if links == nil {
		links = []interface{}{}
	}
	return map[string]interface{}{
		"id":         u.ID,
		"username":   u.Username,
		"name":       u.Name,
		"avatar_url": u.AvatarURL,
		"bio":        u.Bio,
		"links":      links,
		"provider":   u.Provider,
		"created_at": u.CreatedAt,
	}
}

func getPublicUser(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	// /api/users/by-username/foo  or query ?username=
	path := strings.TrimPrefix(r.URL.Path, "/api/users/by-username/")
	username := normalizeUsername(path)
	if username == "" || username == r.URL.Path {
		username = normalizeUsername(r.URL.Query().Get("username"))
	}
	if username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}
	var user User
	if err := db.Where("username = ?", username).First(&user).Error; err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// stats
	var appCount int64
	var likesSum int64
	var commentCount int64
	db.Model(&App{}).Where("user_id = ?", user.ID).Count(&appCount)
	db.Model(&App{}).Where("user_id = ?", user.ID).Select("coalesce(sum(likes_count),0)").Scan(&likesSum)
	// comments on this publisher's apps
	db.Table("comments").
		Joins("JOIN apps ON apps.id = comments.app_id").
		Where("apps.user_id = ?", user.ID).
		Count(&commentCount)

	var apps []App
	db.Where("user_id = ?", user.ID).Order("created_at desc").Find(&apps)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user":          publicUser(user),
		"app_count":     appCount,
		"likes_sum":     likesSum,
		"comment_count": commentCount,
		"apps":          apps,
	})
}

func upsertUser(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method == http.MethodGet {
		email := r.URL.Query().Get("email")
		if email == "" {
			http.Error(w, "email required", http.StatusBadRequest)
			return
		}
		var user User
		if err := db.Where("email = ?", email).First(&user).Error; err != nil {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		// owner view includes email
		out := publicUser(user)
		out["email"] = user.Email
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var input struct {
		Email     string                   `json:"email"`
		Username  string                   `json:"username"`
		Name      string                   `json:"name"`
		AvatarURL string                   `json:"avatar_url"`
		Bio       string                   `json:"bio"`
		Links     []map[string]interface{} `json:"links"`
		Provider  string                   `json:"provider"`
		Suggested string                   `json:"suggested_username"` // optional hint from OAuth
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	var user User
	err := db.Where("email = ?", input.Email).First(&user).Error
	if err == gorm.ErrRecordNotFound {
		// suggest username if provided and free
		uname := ""
		candidate := normalizeUsername(input.Username)
		if candidate == "" {
			candidate = normalizeUsername(input.Suggested)
		}
		if candidate != "" {
			if ok, _ := isUsernameAvailable(candidate, ""); ok {
				uname = candidate
			}
		}
		linksJSON := []byte("[]")
		if input.Links != nil {
			linksJSON, _ = json.Marshal(input.Links)
		}
		user = User{
			ID: uuid.New().String(), Email: input.Email, Username: uname,
			Name: input.Name, AvatarURL: input.AvatarURL, Bio: input.Bio,
			Links: datatypes.JSON(linksJSON), Provider: input.Provider,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := db.Create(&user).Error; err != nil {
			http.Error(w, "failed to create user", http.StatusInternalServerError)
			return
		}
	} else if err == nil {
		updates := map[string]interface{}{"updated_at": now}
		if input.Name != "" {
			updates["name"] = input.Name
		}
		if input.AvatarURL != "" {
			updates["avatar_url"] = input.AvatarURL
		}
		if input.Bio != "" || r.Method == http.MethodPatch {
			// allow clearing bio on explicit patch with empty? only set if key sent — keep simple
			updates["bio"] = input.Bio
		}
		if input.Links != nil {
			b, _ := json.Marshal(input.Links)
			updates["links"] = datatypes.JSON(b)
		}
		if input.Username != "" {
			u := normalizeUsername(input.Username)
			if u != user.Username {
				ok, reason := isUsernameAvailable(u, user.ID)
				if !ok {
					http.Error(w, reason, http.StatusConflict)
					return
				}
				updates["username"] = u
			}
		}
		db.Model(&user).Updates(updates)
		db.First(&user, "id = ?", user.ID)
		// sync publisher fields on apps if username/name/avatar changed
		if user.Username != "" {
			pubLabel := user.Username
			if user.Name != "" {
				// Keep display flexible: store username as publisher label for cards
				pubLabel = user.Username
			}
			db.Model(&App{}).Where("user_id = ?", user.ID).Updates(map[string]interface{}{
				"publisher":          pubLabel,
				"publisher_avatar":   user.AvatarURL,
				"publisher_username": user.Username,
			})
		}
	} else {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	out := publicUser(user)
	out["email"] = user.Email
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}


func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Info)})
	if err != nil {
		log.Fatal("failed to connect to database:", err)
	}
	if err := db.AutoMigrate(&User{}, &App{}, &Comment{}, &Vote{}, &BacklogItem{}); err != nil {
		log.Fatal("failed to migrate database:", err)
	}
	log.Println("Connected to database successfully")

	// Cloudinary (optional) — supports CLOUDINARY_URL or separate keys
	cloudinaryURL := strings.TrimSpace(os.Getenv("CLOUDINARY_URL"))
	if cloudinaryURL != "" {
		cld, err = cloudinary.NewFromURL(cloudinaryURL)
		if err != nil {
			log.Println("WARNING: cloudinary.NewFromURL failed:", err)
			prefix := cloudinaryURL
			if len(prefix) > 30 {
				prefix = prefix[:30] + "..."
			}
			log.Println("CLOUDINARY_URL present, length:", len(cloudinaryURL), "value starts with:", prefix)
		} else {
			cld.Config.URL.Secure = true
			log.Println("Cloudinary configured via CLOUDINARY_URL")
		}
	}
	// Fallback: separate env vars
	if cld == nil {
		cloudName := strings.TrimSpace(os.Getenv("CLOUDINARY_CLOUD_NAME"))
		apiKey := strings.TrimSpace(os.Getenv("CLOUDINARY_API_KEY"))
		apiSecret := strings.TrimSpace(os.Getenv("CLOUDINARY_API_SECRET"))
		if cloudName != "" && apiKey != "" && apiSecret != "" {
			cld, err = cloudinary.NewFromParams(cloudName, apiKey, apiSecret)
			if err != nil {
				log.Println("WARNING: cloudinary.NewFromParams failed:", err)
			} else {
				cld.Config.URL.Secure = true
				log.Println("Cloudinary configured via CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET")
			}
		}
	}
	if cld == nil {
		log.Println("Cloudinary NOT configured – image upload will return 503")
	}

	http.HandleFunc("/api/apps", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodOptions:
			listApps(w, r)
		case http.MethodPost:
			createApp(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
		http.HandleFunc("/api/apps/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodOptions:
			getApp(w, r)
		case http.MethodPatch, http.MethodPut:
			updateApp(w, r)
		case http.MethodDelete:
			deleteApp(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/api/vote", voteHandler)
	http.HandleFunc("/api/comments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodOptions:
			listComments(w, r)
		case http.MethodPost:
			createComment(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/comments/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch, http.MethodPut, http.MethodOptions:
			updateComment(w, r)
		case http.MethodDelete:
			deleteComment(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/upload", uploadImage)
	http.HandleFunc("/api/users", upsertUser)
	http.HandleFunc("/api/user", upsertUser)
	http.HandleFunc("/api/username/check", checkUsername)
	http.HandleFunc("/api/users/by-username/", getPublicUser)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		w.Header().Set("Content-Type", "application/json")
		status := "working fine"
		if sqlDB, err := db.DB(); err != nil || sqlDB.Ping() != nil {
			status = "database connection problem"
		}
		cloudinaryStatus := "not configured"
		if cld != nil {
			cloudinaryStatus = "ok"
		}
		json.NewEncoder(w).Encode(map[string]string{
			"status":     status,
			"service":    "openapp-hub-api",
			"cloudinary": cloudinaryStatus,
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Println("OpenApp Hub backend running on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
