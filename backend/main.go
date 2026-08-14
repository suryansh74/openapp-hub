package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type App struct {
	ID           string    `json:"id" gorm:"primaryKey"`
	Name         string    `json:"name" gorm:"not null"`
	Problem      string    `json:"problem" gorm:"not null"`
	Significance string    `json:"significance"`
	HowToUse     string    `json:"how_to_use"`
	DownloadURL  string    `json:"download_url"`
	Publisher    string    `json:"publisher"`
	CreatedAt    time.Time `json:"created_at"`
}

var db *gorm.DB

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
		Name         string `json:"name"`
		Problem      string `json:"problem"`
		Significance string `json:"significance"`
		HowToUse     string `json:"how_to_use"`
		DownloadURL  string `json:"download_url"`
		Publisher    string `json:"publisher"`
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
		ID:           uuid.New().String(),
		Name:         input.Name,
		Problem:      input.Problem,
		Significance: input.Significance,
		HowToUse:     input.HowToUse,
		DownloadURL:  input.DownloadURL,
		Publisher:    input.Publisher,
		CreatedAt:    time.Now().UTC(),
	}

	if err := db.Create(&app).Error; err != nil {
		http.Error(w, "failed to create app", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(app)
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

	// Auto migrate the App table
	if err := db.AutoMigrate(&App{}); err != nil {
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

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
		w.Header().Set("Content-Type", "application/json")

		// Simple DB check
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
