// src-tauri/src/sync_engine.rs
use tauri::{AppHandle, Manager};
use rusqlite::Connection;
use reqwest::{Client, multipart};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Serialize, Deserialize, Default)]
struct SyncPayload {
    group_id: String,
    device_id: String,
    timestamp: i64,
    favorites: Vec<Value>,
    user_playlists: Vec<Value>,
    playlist: Vec<Value>,
    recent: Vec<Value>,
    user_playlist_tracks: Vec<Value>,
    // You can add the other tables (playlist, recent) here following the exact same pattern!
}

#[tauri::command]
pub async fn trigger_cloud_sync(app: AppHandle, group_id: String, device_id: String, token: String) -> Result<String, String> {
    let client = Client::new();
    let api_url = "https://pan.vma.cc/pan/api.php";

    let token = "69b6919924ce0a87d7c259c650834e48ba01ecc73112676f66cddbc61bd46d6e";

    // ==========================================
    // PHASE A: DISCOVERY & DOWNLOAD
    // ==========================================
    
    let list_res = client.get(format!("{}?action=list", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send().await.map_err(|e| e.to_string())?;
        
    let list_json: Value = list_res.json().await.map_err(|e| e.to_string())?;
    let mut foreign_payloads: Vec<SyncPayload> = Vec::new();

    if let Some(data_array) = list_json["data"].as_array() {
        for file in data_array {
            let file_name = file["name"].as_str().unwrap_or("");
            let file_hash = file["hash"].as_str().unwrap_or("");

            if file_name.starts_with(&group_id) && !file_name.contains(&device_id) {
                let link_res = client.get(format!("{}?action=links&hash={}", api_url, file_hash))
                    .header("Authorization", format!("Bearer {}", token))
                    .send().await.map_err(|e| e.to_string())?;
                
                let link_json: Value = link_res.json().await.map_err(|e| e.to_string())?;
                
                if let Some(download_url) = link_json["data"]["url"].as_str() {
                    let file_content = client.get(download_url).send().await.map_err(|e| e.to_string())?;
                    if let Ok(payload) = file_content.json::<SyncPayload>().await {
                        foreign_payloads.push(payload);
                    }
                }
            }
        }
    }

    // ==========================================
    // PHASE B: THE CRDT MERGE (SQLITE)
    // ==========================================
    
    let json_string = {
        let db_path = app.path().app_local_data_dir()
            .map_err(|_| "Failed to find App Data Dir".to_string())?
            .join("kandb.db");

        let mut db = Connection::open(&db_path).map_err(|e| e.to_string())?;
        db.pragma_update(None, "journal_mode", "WAL").unwrap();

        let tx = db.transaction().map_err(|e| e.to_string())?;
        
        for foreign_payload in foreign_payloads {
            // 1. Merge Favorites
            for fav in foreign_payload.favorites {
                tx.execute(
                    "INSERT INTO favorites (uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted) 
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(platform, bvid) DO UPDATE SET 
                        uuid = excluded.uuid, track_data = excluded.track_data, sort_order = excluded.sort_order,
                        is_deleted = excluded.is_deleted, updated_at = excluded.updated_at 
                     WHERE excluded.updated_at > favorites.updated_at",
                    rusqlite::params![
                        fav["uuid"].as_str(), fav["platform"].as_str(), fav["bvid"].as_str(),
                        fav["track_data"].as_str(), fav["sort_order"].as_i64(),
                        fav["updated_at"].as_i64(), fav["is_deleted"].as_i64()
                    ],
                ).unwrap_or_default(); 
            }

            // 2. Merge User Playlists
            for pl in foreign_payload.user_playlists {
                tx.execute(
                    "INSERT INTO user_playlists (uuid, name, created_at, updated_at, is_deleted) 
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(uuid) DO UPDATE SET 
                        name = excluded.name, is_deleted = excluded.is_deleted, updated_at = excluded.updated_at 
                     WHERE excluded.updated_at > user_playlists.updated_at",
                    rusqlite::params![
                        pl["uuid"].as_str(), pl["name"].as_str(), pl["created_at"].as_i64(),
                        pl["updated_at"].as_i64(), pl["is_deleted"].as_i64()
                    ],
                ).unwrap_or_default();
            }

            // 3. Merge Current Playing Queue (playlist table)
            for item in foreign_payload.playlist {
                tx.execute(
                    "INSERT INTO playlist (uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted) 
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(platform, bvid) DO UPDATE SET 
                        uuid = excluded.uuid, track_data = excluded.track_data, sort_order = excluded.sort_order,
                        is_deleted = excluded.is_deleted, updated_at = excluded.updated_at 
                     WHERE excluded.updated_at > playlist.updated_at",
                    rusqlite::params![
                        item["uuid"].as_str(), item["platform"].as_str(), item["bvid"].as_str(),
                        item["track_data"].as_str(), item["sort_order"].as_i64(),
                        item["updated_at"].as_i64(), item["is_deleted"].as_i64()
                    ],
                ).unwrap_or_default();
            }

            // 4. Merge Recent History & Analytics
            for rec in foreign_payload.recent {
                tx.execute(
                    "INSERT INTO recent (platform, bvid, track_data, play_count, total_time, last_played, updated_at, is_deleted) 
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(platform, bvid) DO UPDATE SET 
                        track_data = excluded.track_data, play_count = excluded.play_count, 
                        total_time = excluded.total_time, last_played = excluded.last_played,
                        is_deleted = excluded.is_deleted, updated_at = excluded.updated_at 
                     WHERE excluded.updated_at > recent.updated_at",
                    rusqlite::params![
                        rec["platform"].as_str(), rec["bvid"].as_str(), rec["track_data"].as_str(),
                        rec["play_count"].as_i64(), rec["total_time"].as_i64(), rec["last_played"].as_i64(),
                        rec["updated_at"].as_i64(), rec["is_deleted"].as_i64()
                    ],
                ).unwrap_or_default();
            }

            // 5. Merge User Playlist Tracks
            for upt in foreign_payload.user_playlist_tracks {
                tx.execute(
                    "INSERT INTO user_playlist_tracks (uuid, playlist_uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted) 
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(playlist_uuid, platform, bvid) DO UPDATE SET 
                        uuid = excluded.uuid, track_data = excluded.track_data, sort_order = excluded.sort_order,
                        is_deleted = excluded.is_deleted, updated_at = excluded.updated_at 
                     WHERE excluded.updated_at > user_playlist_tracks.updated_at",
                    rusqlite::params![
                        upt["uuid"].as_str(), upt["playlist_uuid"].as_str(), upt["platform"].as_str(), upt["bvid"].as_str(),
                        upt["track_data"].as_str(), upt["sort_order"].as_i64(),
                        upt["updated_at"].as_i64(), upt["is_deleted"].as_i64()
                    ],
                ).unwrap_or_default();
            }
        }
        
        tx.commit().map_err(|e| e.to_string())?;

        // ==========================================
        // PHASE C & D: EXPORT NEW TRUTH & UPLOAD
        // ==========================================
        
        let mut final_payload = SyncPayload {
            group_id: group_id.clone(),
            device_id: device_id.clone(),
            timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64,
            ..Default::default()
        };

        // 1. Export Favorites (SAFE)
        if let Ok(mut stmt) = db.prepare("SELECT uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted FROM favorites") {
            if let Ok(iter) = stmt.query_map([], |row| {
                Ok(json!({"uuid": row.get::<_, String>(0)?, "platform": row.get::<_, String>(1)?, "bvid": row.get::<_, String>(2)?, "track_data": row.get::<_, String>(3)?, "sort_order": row.get::<_, i64>(4)?, "updated_at": row.get::<_, i64>(5)?, "is_deleted": row.get::<_, i64>(6)?}))
            }) {
                for item in iter.flatten() { final_payload.favorites.push(item); }
            }
        }

        // 2. Export User Playlists (SAFE)
        if let Ok(mut stmt) = db.prepare("SELECT uuid, name, created_at, updated_at, is_deleted FROM user_playlists") {
            if let Ok(iter) = stmt.query_map([], |row| {
                Ok(json!({"uuid": row.get::<_, String>(0)?, "name": row.get::<_, String>(1)?, "created_at": row.get::<_, i64>(2)?, "updated_at": row.get::<_, i64>(3)?, "is_deleted": row.get::<_, i64>(4)?}))
            }) {
                for item in iter.flatten() { final_payload.user_playlists.push(item); }
            }
        }

        // 3. Export Playing Queue (playlist) (SAFE)
        if let Ok(mut stmt) = db.prepare("SELECT uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted FROM playlist") {
            if let Ok(iter) = stmt.query_map([], |row| {
                Ok(json!({"uuid": row.get::<_, String>(0)?, "platform": row.get::<_, String>(1)?, "bvid": row.get::<_, String>(2)?, "track_data": row.get::<_, String>(3)?, "sort_order": row.get::<_, i64>(4)?, "updated_at": row.get::<_, i64>(5)?, "is_deleted": row.get::<_, i64>(6)?}))
            }) {
                for item in iter.flatten() { final_payload.playlist.push(item); }
            }
        }

        // 4. Export Recent (SAFE)
        if let Ok(mut stmt) = db.prepare("SELECT platform, bvid, track_data, play_count, total_time, last_played, updated_at, is_deleted FROM recent") {
            if let Ok(iter) = stmt.query_map([], |row| {
                Ok(json!({"platform": row.get::<_, String>(0)?, "bvid": row.get::<_, String>(1)?, "track_data": row.get::<_, String>(2)?, "play_count": row.get::<_, i64>(3)?, "total_time": row.get::<_, i64>(4)?, "last_played": row.get::<_, i64>(5)?, "updated_at": row.get::<_, i64>(6)?, "is_deleted": row.get::<_, i64>(7)?}))
            }) {
                for item in iter.flatten() { final_payload.recent.push(item); }
            }
        }

        // 5. Export User Playlist Tracks (SAFE)
        if let Ok(mut stmt) = db.prepare("SELECT uuid, playlist_uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted FROM user_playlist_tracks") {
            if let Ok(iter) = stmt.query_map([], |row| {
                Ok(json!({"uuid": row.get::<_, String>(0)?, "playlist_uuid": row.get::<_, String>(1)?, "platform": row.get::<_, String>(2)?, "bvid": row.get::<_, String>(3)?, "track_data": row.get::<_, String>(4)?, "sort_order": row.get::<_, i64>(5)?, "updated_at": row.get::<_, i64>(6)?, "is_deleted": row.get::<_, i64>(7)?}))
            }) {
                for item in iter.flatten() { final_payload.user_playlist_tracks.push(item); }
            }
        }

        serde_json::to_string(&final_payload).map_err(|e| e.to_string())?
    }; 

    let filename = format!("{}_{}.json", group_id, device_id);

    let file_part = multipart::Part::stream(json_string)
        .file_name(filename.clone())
        .mime_str("application/json").unwrap();

    let form = multipart::Form::new()
        .part("file", file_part)
        .text("name", filename); 

    let _upload_res = client.post(format!("{}?action=upload", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send().await.map_err(|e| e.to_string())?;
    
    Ok("Sync Completed Successfully".to_string())
}