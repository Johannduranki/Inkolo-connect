export interface AvailableLift {
  id: string;
  driverUserId: string;
  driverName: string;
  driverTelephone: string;
  vehicle: string;
  registrationNumber: string;
  seatsAvailable: number;
  rating: number;
  distanceKm: number;
  directionDegrees: number;
  destination: string;
  departureTime: string;
  businessProfileId?: string;
  businessName?: string;
  latitude?: number;
  longitude?: number;
  available?: boolean;
}

export interface LiftOfferInput {
  latitude: number;
  longitude: number;
  vehicle: string;
  registrationNumber: string;
  seatsAvailable: number;
  destination: string;
  departureTime: string;
  businessProfileId?: string;
}

export type RideRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED';

export interface RideRequest {
  id: string;
  liftId: string;
  passengerUserId: string;
  passengerName: string;
  passengerTelephone: string;
  driverUserId: string;
  driverName: string;
  vehicle: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLabel: string;
  requestedAt: string;
  status: RideRequestStatus;
  driverMessage?: string;
}
