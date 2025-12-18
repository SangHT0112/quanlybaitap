import { NextResponse } from "next/server"
import db from "@/lib/db"
import type { RowDataPacket } from "mysql2/promise"

// Định nghĩa kiểu dữ liệu user
interface UserRow extends RowDataPacket {
  id: number
  username: string
  email: string
  role: "admin" | "tenant"
  is_active: number
  created_at: Date
  tier_name: string | null
}

export async function GET() {
  try {
    const [rows] = await db.query<UserRow[]>(`
      SELECT 
        users.id,
        users.username,
        users.email,
        users.role,
        users.is_active,
        users.created_at,
        tiers.tier_name
      FROM users
      LEFT JOIN tiers ON users.tier_id = tiers.id
    `)

    console.log(`✅ Users fetched: ${rows.length} records`)

    return NextResponse.json(rows)
  } catch (error) {
    if (error instanceof Error) {
      console.error("❌ Error in /api/users:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ error: "Unknown error" }, { status: 500 })
  }
}
