import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { PoolConnection, RowDataPacket, FieldPacket } from "mysql2/promise";

interface Book {
  id: number;
  name: string;
  applicable_for: string;  // e.g., "Lớp 1-5"
  publisher: string;
  created_at: string;
  updated_at?: string;
}

export async function GET(request: NextRequest) {
  let connection: PoolConnection | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const className = searchParams.get('class_name');  // Optional filter, e.g., ?class_name=Lớp 1

    connection = await db.getConnection();

    let query = "SELECT id, name, applicable_for, publisher, created_at, updated_at FROM books";
    let params: any[] = [];

    if (className) {
      // Filter: Check nếu className chứa trong applicable_for (case-insensitive)
      query += " WHERE LOWER(applicable_for) LIKE ?";
      params.push(`%${className.toLowerCase()}%`);
    }

    query += " ORDER BY name ASC";

    const [rows]: [RowDataPacket[], FieldPacket[]] = await connection.execute(query, params);

    const books: Book[] = rows as Book[];

    return NextResponse.json(books);
  } catch (err) {
    console.error("❌ Error fetching books:", err);
    return NextResponse.json({ error: "Không thể tải danh sách bộ sách" }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// POST/PUT/DELETE tương tự admin/books trước, nhưng dùng applicable_for thay class_range (string thay JSON)
export async function POST(request: NextRequest) {
  // ... (tương tự code trước, nhưng INSERT INTO books (name, applicable_for, publisher) VALUES (?, ?, ?)
}