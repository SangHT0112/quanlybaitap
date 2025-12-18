import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import jwt from 'jsonwebtoken'
import db from '@/lib/db'
import type { OkPacket, FieldPacket, RowDataPacket } from 'mysql2'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
)

// Định nghĩa kiểu dữ liệu user (phù hợp với bảng users)
interface UserRow extends RowDataPacket {
  id: number
  username: string
  email: string
  google_id: string
  role: string
}

export async function POST(request: NextRequest) {
  let connection
  try {
    const { credential } = await request.json()

    const ticket = await oauth2Client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()

    if (!payload) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 })
    }

    const { email, name, sub: googleId } = payload

    connection = await db.getConnection()

    // ✅ Dùng UserRow thay vì any
    const [existingRows]: [UserRow[], FieldPacket[]] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    )

    let user: UserRow
    if (existingRows.length > 0) {
      user = existingRows[0]
      await connection.execute(
        'UPDATE users SET username = ?, google_id = ? WHERE id = ?',
        [name, googleId, user.id]
      )
    } else {
      const [result]: [OkPacket, FieldPacket[]] = await connection.execute(
        'INSERT INTO users (email, username, google_id, role) VALUES (?, ?, ?, ?)',
        [email, name, googleId, 'teacher']
      )
      user = { id: result.insertId, username: name, email, google_id: googleId, role: 'teacher' } as UserRow
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    return NextResponse.json({ token, user })
  } catch (error) {
    console.error('Lỗi Google login:', error)
    return NextResponse.json({ message: 'Lỗi server' }, { status: 500 })
  } finally {
    if (connection) connection.release()
  }
}
