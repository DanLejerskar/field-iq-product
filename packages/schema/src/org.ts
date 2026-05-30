/**
 * Organization, User, Device, Equipment.
 *
 * FIELD_IQ_PRODUCT_SPEC.md §4 does not define these relational entities, so their
 * shape is taken from the colleague's data model in 02_Architecture.md §3.3.2
 * (authoritative for the persisted tables). Field names use camelCase here; the
 * Drizzle layer (M2) maps them to the snake_case columns.
 */
import type { DeviceId, EquipmentId, IsoTimestamp, OrganizationId, UserId } from './common.js';

export interface Organization {
  id: OrganizationId;
  name: string;
  createdAt: IsoTimestamp;
  settings: Record<string, unknown>;
}

/** Access roles. PRD §7.5 / Architecture §3.3.2. */
export type UserRole = 'admin' | 'trainer' | 'supervisor' | 'technician';

export interface User {
  id: UserId;
  orgId: OrganizationId;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  createdAt: IsoTimestamp;
  lastLoginAt?: IsoTimestamp;
  isActive: boolean;
}

export type DeviceType = 'glasses' | 'phone';

export interface Device {
  id: DeviceId;
  orgId: OrganizationId;
  serial: string;
  type: DeviceType;
  pairedUserId?: UserId;
  pairedAt?: IsoTimestamp;
  lastSeenAt?: IsoTimestamp;
}

export interface Equipment {
  id: EquipmentId;
  orgId: OrganizationId;
  name: string;
  assetTag: string;
  /** Value encoded in the printed QR affixed to the equipment, e.g. "EON-LOTO-DAC811-01". */
  qrCodeValue: string;
  description: string;
  location: string;
  photoUrl?: string;
  metadata: Record<string, unknown>;
}
