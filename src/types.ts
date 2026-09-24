export type LotType = "C" | "Y" | "H";
export type Radius = 500 | 1000 | 2000;
export type SelectionSource = "map" | "list";

export interface Carpark {
  CarParkID: string;
  Development: string;
  Area: string;
  Agency: string;
  LotType: string;
  AvailableLots: number;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface CarparksResponse {
  fetchedAt: string;
  radiusM: number;
  total: number;
  partial?: boolean;
  carparks: Carpark[];
}

export interface Place {
  label: string;
  address: string;
  postal: string;
  lat: number;
  lng: number;
}

export interface Address {
  building: string;
  road: string;
  block: string;
  postal: string;
  found?: boolean;
}

export interface Destination {
  lat: number;
  lng: number;
}

export const carparkKey = (c: Carpark) => `${c.Agency}:${c.CarParkID}:${c.LotType}`;
