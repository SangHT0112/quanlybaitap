// app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import db from '@/lib/db'
import type { FieldPacket, RowDataPacket } from 'mysql2'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Định nghĩa kiểu dữ liệu user (phù hợp với bảng users)
interface UserRow extends RowDataPacket {
  id: number
  username: string
  email: string
  google_id?: string
  role: string
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'No token' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string }

    const connection = await db.getConnection()
    // ✅ Dùng UserRow thay vì any
    const [rows]: [UserRow[], FieldPacket[]] = await connection.execute(
      'SELECT * FROM users WHERE id = ?',
      [decoded.userId]
    )

    await connection.release()

    if (rows.length === 0) {
      return NextResponse.json({ message: 'User not found' }, { status: 401 })
    }

    return NextResponse.json({ valid: true, user: rows[0] })
  } catch (error) {
    console.error('Verify error:', error)
    return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
  }
}
