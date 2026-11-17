export type BookingStatus = 'pending' | 'called' | 'completed' | 'cancelled';

export type BookingWorkStage =
  | 'new'
  | 'accepted'
  | 'on_the_way'
  | 'repairing'
  | 'completed'
  | 'cancelled';

export type SubAdminAvatarColor = 'blue' | 'emerald' | 'slate' | 'amber' | 'violet';

export interface SubAdminProfile {
  uid: string;
  username: string;
  authEmail: string;
  name: string;
  phone: string;
  area: string;
  specialty: string;
  bio: string;
  avatarColor: SubAdminAvatarColor;
  role: 'sub_admin';
  active: boolean;
  createdAtText: string;
}

export interface BookingDetails {
  id: string;
  bookingCode: string;
  customerName: string;
  phoneNumber: string;
  area: string;
  phoneModel: string;
  serviceId: string;
  serviceName: string;
  priceSummary: string;
  status: BookingStatus;
  adminNote: string;
  workStage: BookingWorkStage;
  assignedSubAdminUid: string;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  createdAtMs: number;
  createdAtText: string;
}

export interface ServiceRateItem {
  id: string;
  name: string;
  subtitle: string;
  shopPriceText: string;
  ourPriceText: string;
  active: boolean;
}
