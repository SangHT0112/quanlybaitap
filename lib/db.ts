// lib/db.ts (hoặc db.js nếu dùng JS) - Dùng code cũ của bạn, giữ nguyên
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT), // thêm dòng này
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: '+07:00',
  connectionLimit: 10,
});

export default db;