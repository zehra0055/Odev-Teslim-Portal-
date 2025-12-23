// Server/db.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("odevteslim"); // DB adı
    console.log("MongoDB bağlandı ✅");
  }
  return db;
}

module.exports = connectDB;
