package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type User struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	Email     string    `json:"email" gorm:"uniqueIndex;not null"`
	Name      string    `json:"name"`
	AvatarURL string    `json:"avatar_url"`
	Provider  string    `json:"provider"` // google, github
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type App struct {
	ID              string    `json:"id" gorm:"primaryKey"`
	Name            string    `json:"name" gorm:"not null"`
	Problem         string    `json:"problem" gorm:"not null"`
	Significance    string    `json:"significance"`
	HowToUse        string    `json:"how_to_use"`
	DownloadURL     string    `json:"download_url"`
	IconURL         string    `json:"icon_url"`
	Publisher       string    `json:"publisher"`
	PublisherAvatar string    `json:"publisher_avatar"`
	UserID          string    `json:"user_id" gorm:"index"` // links to User
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// BacklogItem is a flexible store for future features / reserved work.
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

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
		Name            string `json:"name"`
		Problem         string `json:"problem"`
		Significance    string `json:"significance"`
		HowToUse        string `json:"how_to_use"`
		DownloadURL     string `json:"download_url"`
		IconURL         string `json:"icon_url"`
		Publisher       string `json:"publisher"`
		PublisherAvatar string `json:"publisher_avatar"`
		UserEmail       string `json:"user_email"` // used to link / upsert user
		UserName        string `json:"user_name"`
		UserAvatar      string `json:"user_avatar"`
		Provider        string `json:"provider"`
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

	// Upsert user if email is provided
	if input.UserEmail != "" {
		var user User
		err := db.Where("email = ?", input.UserEmail).First(&user).Error
		if err == gorm.ErrRecordNotFound {
			user = User{
				ID:        uuid.New().String(),
				Email:     input.UserEmail,
				Name:      input.UserName,
				AvatarURL: input.UserAvatar,
				Provider:  input.Provider,
				CreatedAt: now,
				UpdatedAt: now,
			}
			db.Create(&user)
		} else if err == nil {
			// Update name/avatar if changed
			updates := map[string]interface{}{"updated_at": now}
			if input.UserName != "" {
				updates["name"] = input.UserName
			}
			if input.UserAvatar != "" {
				updates["avatar_url"] = input.UserAvatar
			}
			db.Model(&user).Updates(updates)
			db.First(&user, "id = ?", user.ID)
		}
		userID = user.ID

		// Prefer the stored user avatar for the app
		if user.AvatarURL != "" {
			input.PublisherAvatar = user.AvatarURL
		}
		if user.Name != "" && input.Publisher == "" {
			input.Publisher = user.Name
		}
	}

	app := App{
		ID:              uuid.New().String(),
		Name:            input.Name,
		Problem:         input.Problem,
		Significance:    input.Significance,
		HowToUse:        input.HowToUse,
		DownloadURL:     input.DownloadURL,
		IconURL:         input.IconURL,
		Publisher:       input.Publisher,
		PublisherAvatar: input.PublisherAvatar,
		UserID:          userID,
		CreatedAt:       now,
		UpdatedAt:       now,
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
	allowed := []string{"name", "problem", "significance", "how_to_use", "download_url", "icon_url", "publisher", "publisher_avatar"}
	for _, key := range allowed {
		if v, ok := input[key]; ok {
			updates[key] = v
		}
	}

	if err := db.Model(&app).Updates(updates).Error; err != nil {
		http.Error(w, "failed to update", http.StatusInternalServerError)
		return
	}

	db.First(&app, "id = ?", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
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
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	var user User
	err := db.Where("email = ?", input.Email).First(&user).Error
	if err == gorm.ErrRecordNotFound {
		user = User{
			ID:        uuid.New().String(),
			Email:     input.Email,
			Name:      input.Name,
			AvatarURL: input.AvatarURL,
			Provider:  input.Provider,
			CreatedAt: now,
			UpdatedAt: now,
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
		if input.Provider != "" {
			updates["provider"] = input.Provider
		}
		db.Model(&user).Updates(updates)
		db.First(&user, "id = ?", user.ID)
	} else {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// --- Backlog ---

func listBacklog(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	status := r.URL.Query().Get("status")
	category := r.URL.Query().Get("category")

	q := db.Order("created_at desc")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if category != "" {
		q = q.Where("category = ?", category)
	}

	var items []BacklogItem
	if err := q.Find(&items).Error; err != nil {
		http.Error(w, "failed to fetch backlog", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func createBacklog(w http.ResponseWriter, r *http.Request) {
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
		Title       string                 `json:"title"`
		Description string                 `json:"description"`
		Category    string                 `json:"category"`
		Priority    string                 `json:"priority"`
		Status      string                 `json:"status"`
		Stage       string                 `json:"stage"`
		Done        *bool                  `json:"done"`
		Meta        map[string]interface{} `json:"meta"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Title == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}

	status := input.Status
	if status == "" {
		status = "reserved"
	}
	priority := input.Priority
	if priority == "" {
		priority = "medium"
	}
	done := false
	if input.Done != nil {
		done = *input.Done
	}

	metaBytes, _ := json.Marshal(input.Meta)
	if input.Meta == nil {
		metaBytes = []byte("{}")
	}

	now := time.Now().UTC()
	item := BacklogItem{
		ID:          uuid.New().String(),
		Title:       input.Title,
		Description: input.Description,
		Category:    input.Category,
		Priority:    priority,
		Status:      status,
		Stage:       input.Stage,
		Done:        done,
		Meta:        datatypes.JSON(metaBytes),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := db.Create(&item).Error; err != nil {
		http.Error(w, "failed to create backlog item: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(item)
}

func updateBacklog(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/backlog/")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	var item BacklogItem
	if err := db.First(&item, "id = ?", id).Error; err != nil {
		http.Error(w, "item not found", http.StatusNotFound)
		return
	}

	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now().UTC()}
	for _, key := range []string{"title", "description", "category", "priority", "status", "stage"} {
		if v, ok := input[key]; ok {
			updates[key] = v
		}
	}
	if v, ok := input["done"]; ok {
		updates["done"] = v
		if done, ok := v.(bool); ok && done {
			updates["status"] = "done"
		}
	}
	if v, ok := input["meta"]; ok {
		metaBytes, _ := json.Marshal(v)
		updates["meta"] = datatypes.JSON(metaBytes)
	}

	if err := db.Model(&item).Updates(updates).Error; err != nil {
		http.Error(w, "failed to update", http.StatusInternalServerError)
		return
	}

	db.First(&item, "id = ?", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatal("failed to connect to database:", err)
	}

	if err := db.AutoMigrate(&User{}, &App{}, &BacklogItem{}); err != nil {
		log.Fatal("failed to migrate database:", err)
	}

	log.Println("Connected to database successfully")

	http.HandleFunc("/api/apps", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodOptions {
			listApps(w, r)
			return
		}
		if r.Method == http.MethodPost {
			createApp(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	http.HandleFunc("/api/apps/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodOptions {
			getApp(w, r)
			return
		}
		if r.Method == http.MethodPatch || r.Method == http.MethodPut {
			updateApp(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	http.HandleFunc("/api/users", upsertUser)
	http.HandleFunc("/api/user", upsertUser) // alias

	http.HandleFunc("/api/backlog", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodOptions {
			listBacklog(w, r)
			return
		}
		if r.Method == http.MethodPost {
			createBacklog(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	http.HandleFunc("/api/backlog/", updateBacklog)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		w.Header().Set("Content-Type", "application/json")

		sqlDB, err := db.DB()
		status := "working fine"
		if err != nil || sqlDB.Ping() != nil {
			status = "database connection problem"
		}

		json.NewEncoder(w).Encode(map[string]string{
			"status":  status,
			"service": "openapp-hub-api",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Println("OpenApp Hub backend running on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
