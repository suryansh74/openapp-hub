package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

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
	CreatedAt       time.Time `json:"created_at"`
}

// BacklogItem is a flexible store for future features / reserved work.
// Extra fields go into Meta (JSONB) so the schema can grow without migrations.
type BacklogItem struct {
	ID          string         `json:"id" gorm:"primaryKey"`
	Title       string         `json:"title" gorm:"not null"`
	Description string         `json:"description"`
	Category    string         `json:"category"` // e.g. auth, ai, ui, infra, search
	Priority    string         `json:"priority"` // low, medium, high, critical
	Status      string         `json:"status" gorm:"default:reserved"` // reserved, in_progress, done, cancelled
	Stage       string         `json:"stage"`    // e.g. stage2, stage3, stage4, later
	Done        bool           `json:"done" gorm:"default:false"`
	Meta        datatypes.JSON `json:"meta" gorm:"type:jsonb;default:'{}'"` // flexible extra data
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

var db *gorm.DB

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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

	id := r.URL.Path[len("/api/apps/"):]
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
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	if input.Name == "" || input.Problem == "" {
		http.Error(w, "name and problem are required", http.StatusBadRequest)
		return
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
		CreatedAt:       time.Now().UTC(),
	}

	if err := db.Create(&app).Error; err != nil {
		http.Error(w, "failed to create app", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(app)
}

// --- Backlog (future / reserved features) ---

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
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
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

	id := r.URL.Path[len("/api/backlog/"):]
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

	// Flexible updates – only touch provided fields
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

	if err := db.AutoMigrate(&App{}, &BacklogItem{}); err != nil {
		log.Fatal("failed to migrate database:", err)
	}

	log.Println("Connected to Neon database successfully")

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

	http.HandleFunc("/api/apps/", getApp)

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
