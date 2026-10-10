import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@smart-ambulance/database';
import { UserRole } from '@smart-ambulance/shared';
import { config } from '../config';

export class AuthService {
  async register(data: { name: string; email: string; password: string; role?: UserRole; phone?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      throw new Error('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role || UserRole.NORMAL_USER,
        phone: data.phone || null
      },
      select: { id: true, name: true, email: true, role: true, phone: true }
    });

    const token = this.generateToken(user.id, user.role as UserRole);
    return { user, token };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        hospital: { select: { id: true, name: true } },
        ambulances: { select: { id: true, registrationNumber: true, status: true } }
      }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    const token = this.generateToken(user.id, user.role as UserRole);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as UserRole,
        phone: user.phone,
        hospitalId: user.hospitalId,
        hospitalName: user.hospital?.name,
        assignedAmbulance: user.ambulances[0] || null
      },
      token
    };
  }

  generateToken(userId: string, role: UserRole): string {
    return jwt.sign({ userId, role }, config.jwtSecret, { expiresIn: '7d' });
  }
}

export const authService = new AuthService();
