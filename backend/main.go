package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

type App struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Problem      string    `json:"problem"`
	Significance string    `json:"significance"`
	HowToUse     string    `json:"how_to_use"`
	DownloadURL  string    `json:"download_url"`
	Publisher    string    `json:"publisher"`
	CreatedAt    time.Time `json:"created_at"`
}

var (
	apps  = make(map[string]App)
	mutex sync.RWMutex
)

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

	mutex.RLock()
	defer mutex.RUnlock()

	list := make([]App, 0, len(apps))
	for _, a := range apps {
		list = append(list, a)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
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

	mutex.RLock()
	app, ok := apps[id]
	mutex.RUnlock()

	if !ok {
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

	mutex.Lock()
	apps[app.ID] = app
	mutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(app)
}

func main() {
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
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "working fine",
			"service": "openapp-hub-api",
		})
	})

	log.Println("OpenApp Hub backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
