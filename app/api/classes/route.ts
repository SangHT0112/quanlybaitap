import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { PoolConnection, RowDataPacket, FieldPacket } from "mysql2/promise";

interface Class {
  id: number;
  name: string;
}

export async function GET(request: NextRequest) {
  let connection: PoolConnection | null = null;

  try {
    connection = await db.getConnection();

    const [rows]: [RowDataPacket[], FieldPacket[]] = await connection.execute(
      "SELECT id, name FROM classes ORDER BY name ASC"
    );

    const classes: Class[] = rows as Class[];

    return NextResponse.json(classes);
  } catch (err) {
    console.error("❌ Error fetching classes:", err);
    return NextResponse.json(
      { error: "Không thể tải danh sách lớp học" },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}