import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import sqlite3 from "sqlite3";


async function searchWeb(query) {
    try {
        const url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(query);
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.extract) {
            return data.extract;
        } else {
            return "Nu am găsit informații pe internet.";
        }
    } catch (e) {
        return "Eroare la accesarea internetului.";
    }
}


// === SQLite DB ===
const db = new sqlite3.Database("msql/chat.db", (err) => {
    if (err) {
        console.error("Eroare la deschiderea bazei de date:", err);
    } else {
        console.log("SQLite conectat la msql/chat.db");
    }
});

// Creează tabelul dacă nu există
db.run(`
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT,
        reply TEXT,
        model TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/generate", async (req, res) => {
    let { model, prompt } = req.body;

    // === Detectăm trigger-ul pentru internet ===
    if (prompt.includes("@web:")) {
        const query = prompt.split("@web:")[1].trim();

        const webInfo = await searchWeb(query);

        prompt =
            `Informații obținute de pe internet despre "${query}":\n` +
            webInfo +
            `\n\nFolosind aceste informații, răspunde în limba română la întrebarea:\n` +
            req.body.prompt;
    }

    // === Trimitem promptul (modificat sau nu) la Ollama ===
    const ollamaResponse = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt }),
    });

    res.setHeader("Content-Type", "application/json");
    ollamaResponse.body.pipe(res);
});


// === Salvare conversație în SQLite ===
app.post("/api/save", (req, res) => {
    const { prompt, reply, model } = req.body;

    db.run(
        "INSERT INTO history (prompt, reply, model) VALUES (?, ?, ?)",
        [prompt, reply, model],
        (err) => {
            if (err) {
                console.error("Eroare la salvare:", err);
                res.status(500).json({ error: "Eroare la salvare" });
            } else {
                res.json({ status: "ok" });
            }
        }
    );
});

// === Încărcare istoric conversație ===
app.get("/api/history", (req, res) => {
    db.all("SELECT * FROM history ORDER BY id ASC", (err, rows) => {
        if (err) {
            res.status(500).json({ error: "Eroare la citire" });
        } else {
            res.json(rows);
        }
    });
});

// === Pornire server ===
app.listen(3000, () => console.log("Proxy pornit pe http://localhost:3000"));
