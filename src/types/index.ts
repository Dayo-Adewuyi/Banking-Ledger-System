import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
}

export interface JwtUserPayload extends JwtPayload {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}