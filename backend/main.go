package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
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
	ID        string    `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Name      string    `json:"name"`
	AvatarURL string    `json:"avatar_url"`
	Provider  string    `json:"provider"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
	Publisher       string         `json:"publisher"`
	PublisherAvatar string         `json:"publisher_avatar"`
	UserID          string         `json:"user_id" gorm:"index"`
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
	var apps []App
	if err := db.Order("created_at desc").Find(&apps).Error; err != nil {
		http.Error(w, "failed to fetch apps", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(apps)
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

	var input struct {
		Name            string   `json:"name"`
		Problem         string   `json:"problem"`
		Significance    string   `json:"significance"`
		HowToUse        string   `json:"how_to_use"`
		DownloadURL     string   `json:"download_url"`
		IconURL         string   `json:"icon_url"`
		Screenshots     []string `json:"screenshots"`
		YoutubeURL      string   `json:"youtube_url"`
		Publisher       string   `json:"publisher"`
		PublisherAvatar string   `json:"publisher_avatar"`
		UserEmail       string   `json:"user_email"`
		UserName        string   `json:"user_name"`
		UserAvatar      string   `json:"user_avatar"`
		Provider        string   `json:"provider"`
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
	if input.UserEmail != "" {
		var user User
		err := db.Where("email = ?", input.UserEmail).First(&user).Error
		if err == gorm.ErrRecordNotFound {
			user = User{ID: uuid.New().String(), Email: input.UserEmail, Name: input.UserName, AvatarURL: input.UserAvatar, Provider: input.Provider, CreatedAt: now, UpdatedAt: now}
			db.Create(&user)
		} else if err == nil {
			db.Model(&user).Updates(map[string]interface{}{"name": input.UserName, "avatar_url": input.UserAvatar, "updated_at": now})
			db.First(&user, "id = ?", user.ID)
		}
		userID = user.ID
		if user.AvatarURL != "" {
			input.PublisherAvatar = user.AvatarURL
		}
		if user.Name != "" && input.Publisher == "" {
			input.Publisher = user.Name
		}
	}

	ss, _ := json.Marshal(input.Screenshots)
	if input.Screenshots == nil {
		ss = []byte("[]")
	}

	app := App{
		ID: uuid.New().String(), Name: input.Name, Problem: input.Problem, Significance: input.Significance,
		HowToUse: input.HowToUse, DownloadURL: input.DownloadURL, IconURL: input.IconURL,
		Screenshots: datatypes.JSON(ss), YoutubeURL: input.YoutubeURL,
		Publisher: input.Publisher, PublisherAvatar: input.PublisherAvatar, UserID: userID,
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

	updates := map[string]interface{}{"updated_at": time.Now().UTC()}
	for _, key := range []string{"name", "problem", "significance", "how_to_use", "download_url", "icon_url", "youtube_url", "publisher", "publisher_avatar"} {
		if v, ok := input[key]; ok {
			updates[key] = v
		}
	}
	if v, ok := input["screenshots"]; ok {
		b, _ := json.Marshal(v)
		updates["screenshots"] = datatypes.JSON(b)
	}

	if err := db.Model(&app).Updates(updates).Error; err != nil {
		http.Error(w, "failed to update", http.StatusInternalServerError)
		return
	}
	db.First(&app, "id = ?", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
}

// --- Votes (like / dislike) ---

func voteHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
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

	// return updated counts
	if input.TargetType == "app" {
		var app App
		db.First(&app, "id = ?", input.TargetID)
		json.NewEncoder(w).Encode(map[string]int{"likes_count": app.LikesCount, "dislikes_count": app.DislikesCount})
	} else {
		var c Comment
		db.First(&c, "id = ?", input.TargetID)
		json.NewEncoder(w).Encode(map[string]int{"likes_count": c.LikesCount, "dislikes_count": c.DislikesCount})
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
	// Also delete nested replies
	db.Where("parent_id = ?", id).Delete(&Comment{})
	db.Delete(&c)
	// Clean up votes on this comment
	db.Where("target_type = ? AND target_id = ?", "comment", id).Delete(&Vote{})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// --- Upload (Cloudinary, max 1MB) ---

func uploadImage(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if cld == nil {
		http.Error(w, "cloudinary not configured", http.StatusServiceUnavailable)
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

// --- Users ---

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
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var input struct {
		Email     string `json:"email"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
		Provider  string `json:"provider"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Email == "" {
		http.Error(w, "email required", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	var user User
	err := db.Where("email = ?", input.Email).First(&user).Error
	if err == gorm.ErrRecordNotFound {
		user = User{ID: uuid.New().String(), Email: input.Email, Name: input.Name, AvatarURL: input.AvatarURL, Provider: input.Provider, CreatedAt: now, UpdatedAt: now}
		db.Create(&user)
	} else if err == nil {
		updates := map[string]interface{}{"updated_at": now}
		if input.Name != "" {
			updates["name"] = input.Name
		}
		if input.AvatarURL != "" {
			updates["avatar_url"] = input.AvatarURL
		}
		db.Model(&user).Updates(updates)
		db.First(&user, "id = ?", user.ID)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
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

	// Cloudinary (optional)
	if cloudinaryURL := os.Getenv("CLOUDINARY_URL"); cloudinaryURL != "" {
		cld, err = cloudinary.NewFromURL(cloudinaryURL)
		if err != nil {
			log.Println("warning: cloudinary init failed:", err)
		} else {
			cld.Config.URL.Secure = true
			log.Println("Cloudinary configured")
		}
	} else {
		log.Println("CLOUDINARY_URL not set – image upload disabled")
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
		path := r.URL.Path
		if strings.Contains(path, "/vote") {
			// reserved
			http.Error(w, "use /api/vote", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet, http.MethodOptions:
			getApp(w, r)
		case http.MethodPatch, http.MethodPut:
			updateApp(w, r)
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

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		w.Header().Set("Content-Type", "application/json")
		status := "working fine"
		if sqlDB, err := db.DB(); err != nil || sqlDB.Ping() != nil {
			status = "database connection problem"
		}
		json.NewEncoder(w).Encode(map[string]string{"status": status, "service": "openapp-hub-api"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Println("OpenApp Hub backend running on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
