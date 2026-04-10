import { apiClient } from '@/lib/api-client';

/* ─── Tipler ──────────────────────────────────────────────── */

export type VehicleType   = 'TIR' | 'KAMYON' | 'KAMYONET' | 'PICKUP' | 'FORKLIFT' | 'DIGER';
export type VehicleStatus = 'AKTIF' | 'PASIF' | 'BAKIMDA';
export type DriverStatus  = 'AKTIF' | 'PASIF' | 'IZINDE';
export type LicenseClass  = 'B' | 'C' | 'CE' | 'D' | 'DE';
export type TripStatus    = 'PLANLANMIS' | 'YOLDA' | 'TAMAMLANDI' | 'IPTAL';
export type MaintenanceType = 'PERIYODIK' | 'LASTIK' | 'FREN' | 'YAG' | 'ARIZA' | 'DIGER';

export interface Vehicle {
  id:                       string;
  tenantId:                 string;
  plate:                    string;
  brand:                    string;
  model:                    string;
  year?:                    number;
  type:                     VehicleType;
  capacityKg?:              number;
  volumeM3?:                number;
  status:                   VehicleStatus;
  assignedWarehouseId?:     string;
  currentKm:                number;
  vin?:                     string;
  registrationExpires?:     string;
  inspectionExpires?:       string;
  insuranceExpires?:        string;
  trafficInsuranceExpires?: string;
  gpsDeviceId?:             string;
  gpsProvider?:             string;
  lastLat?:                 number;
  lastLng?:                 number;
  lastSpeedKmh?:            number;
  lastLocationAt?:          string;
  createdAt:                string;
  updatedAt:                string;
}

export interface Driver {
  id:               string;
  tenantId:         string;
  employeeId?:      string;
  firstName:        string;
  lastName:         string;
  phone?:           string;
  licenseClass:     LicenseClass;
  licenseNumber?:   string;
  licenseExpires?:  string;
  status:           DriverStatus;
  currentVehicleId?: string;
  createdAt:        string;
  updatedAt:        string;
}

export interface Trip {
  id:               string;
  tenantId:         string;
  tripNumber:       string;
  vehicleId:        string;
  driverId:         string;
  salesOrderId?:    string;
  deliveryId?:      string;
  origin:           string;
  destination:      string;
  plannedDeparture: string;
  actualDeparture?: string;
  plannedArrival?:  string;
  actualArrival?:   string;
  startKm?:         number;
  endKm?:           number;
  distanceKm?:      number;
  status:           TripStatus;
  notes?:           string;
  createdBy:        string;
  createdAt:        string;
  updatedAt:        string;
}

export interface MaintenanceRecord {
  id:              string;
  tenantId:        string;
  vehicleId:       string;
  type:            MaintenanceType;
  description:     string;
  serviceDate:     string;
  nextServiceDate?: string;
  nextServiceKm?:  number;
  kmAtService?:    number;
  costKurus:       number;
  vendor?:         string;
  invoiceNumber?:  string;
  createdAt:       string;
}

export interface FuelRecord {
  id:                 string;
  tenantId:           string;
  vehicleId:          string;
  tripId?:            string;
  fuelingDate:        string;
  liters:             number;
  pricePerLiterKurus: number;
  totalKurus:         number;
  station?:           string;
  kmAtFueling?:       number;
  createdAt:          string;
}

export interface FuelStats {
  totalLiters:     number;
  totalKurus:      number;
  recordCount:     number;
  avgConsumption?: number; // lt/100km
}

export type DeviceType = 'HGS' | 'OGS';

export interface HgsRecord {
  id:              string;
  tenantId:        string;
  vehicleId:       string;
  transactionDate: string;
  amountKurus:     number;
  balanceKurus?:   number;
  deviceType:      DeviceType;
  deviceId?:       string;
  location?:       string;
  direction?:      string;
  tripId?:         string;
  note?:           string;
  createdAt:       string;
}

export interface HgsVehicleReport {
  vehicleId:        string;
  plate:            string;
  totalAmountKurus: number;
  transactionCount: number;
  hgsCount:         number;
  ogsCount:         number;
  byMonth: { month: string; amountKurus: number; count: number }[];
}

export interface HgsTenantSummary {
  totalAmountKurus: number;
  transactionCount: number;
  byVehicle: { vehicleId: string; plate: string; amountKurus: number; count: number }[];
}

export interface GpsLocation {
  id:         string;
  vehicleId:  string;
  tripId?:    string;
  lat:        number;
  lng:        number;
  speedKmh?:  number;
  heading?:   number;
  recordedAt: string;
}

/* ─── Etiketler ──────────────────────────────────────────── */

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  TIR:       'Tır',
  KAMYON:    'Kamyon',
  KAMYONET:  'Kamyonet',
  PICKUP:    'Pickup',
  FORKLIFT:  'Forklift',
  DIGER:     'Diğer',
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  AKTIF:   'Aktif',
  PASIF:   'Pasif',
  BAKIMDA: 'Bakımda',
};

export const VEHICLE_STATUS_CLS: Record<VehicleStatus, string> = {
  AKTIF:   'badge-green',
  PASIF:   'badge-gray',
  BAKIMDA: 'badge-yellow',
};

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  AKTIF:  'Aktif',
  PASIF:  'Pasif',
  IZINDE: 'İzinde',
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANLANMIS: 'Planlandı',
  YOLDA:      'Yolda',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL:      'İptal',
};

export const TRIP_STATUS_CLS: Record<TripStatus, string> = {
  PLANLANMIS: 'badge-blue',
  YOLDA:      'badge-yellow',
  TAMAMLANDI: 'badge-green',
  IPTAL:      'badge-red',
};

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  PERIYODIK: 'Periyodik',
  LASTIK:    'Lastik',
  FREN:      'Fren',
  YAG:       'Yağ Değişimi',
  ARIZA:     'Arıza',
  DIGER:     'Diğer',
};

/* ─── API ────────────────────────────────────────────────── */

export const fleetApi = {
  vehicles: {
    list: (params?: { status?: string; type?: string; limit?: number; page?: number; offset?: number }) =>
      apiClient.get<{ items: Vehicle[]; total: number; page: number; limit: number }>('/fleet/vehicles', { params }),

    get: (id: string) =>
      apiClient.get<Vehicle>(`/fleet/vehicles/${id}`),

    create: (dto: Partial<Vehicle>) =>
      apiClient.post<Vehicle>('/fleet/vehicles', dto),

    update: (id: string, dto: Partial<Vehicle>) =>
      apiClient.patch<Vehicle>(`/fleet/vehicles/${id}`, dto),

    getTrips: (id: string) =>
      apiClient.get<Trip[]>(`/fleet/vehicles/${id}/trips`),

    getMaintenance: (id: string) =>
      apiClient.get<MaintenanceRecord[]>(`/fleet/vehicles/${id}/maintenance`),

    getFuel: (id: string) =>
      apiClient.get<FuelRecord[]>(`/fleet/vehicles/${id}/fuel`),

    getFuelStats: (id: string) =>
      apiClient.get<FuelStats>(`/fleet/vehicles/${id}/fuel/stats`),

    getLocations: (id: string) =>
      apiClient.get<GpsLocation[]>(`/fleet/gps/vehicles/${id}/locations`),
  },

  drivers: {
    list: (params?: { status?: string; limit?: number; page?: number; offset?: number }) =>
      apiClient.get<{ items: Driver[]; total: number; page: number; limit: number }>('/fleet/drivers', { params }),

    get: (id: string) =>
      apiClient.get<Driver>(`/fleet/drivers/${id}`),

    create: (dto: Partial<Driver>) =>
      apiClient.post<Driver>('/fleet/drivers', dto),

    update: (id: string, dto: Partial<Driver>) =>
      apiClient.patch<Driver>(`/fleet/drivers/${id}`, dto),

    assignVehicle: (driverId: string, vehicleId: string) =>
      apiClient.post(`/fleet/drivers/${driverId}/assign/${vehicleId}`, {}),
  },

  trips: {
    list: (params?: { status?: string; vehicleId?: string; driverId?: string; limit?: number; page?: number; offset?: number }) =>
      apiClient.get<{ data: Trip[]; total: number }>('/fleet/trips', { params }),

    get: (id: string) =>
      apiClient.get<Trip>(`/fleet/trips/${id}`),

    create: (dto: Partial<Trip>) =>
      apiClient.post<Trip>('/fleet/trips', dto),

    start: (id: string) =>
      apiClient.post<Trip>(`/fleet/trips/${id}/start`, {}),

    complete: (id: string, endKm: number) =>
      apiClient.post<Trip>(`/fleet/trips/${id}/complete`, { endKm }),

    cancel: (id: string) =>
      apiClient.post<Trip>(`/fleet/trips/${id}/cancel`, {}),
  },

  maintenance: {
    create: (vehicleId: string, dto: Partial<MaintenanceRecord>) =>
      apiClient.post<MaintenanceRecord>(`/fleet/vehicles/${vehicleId}/maintenance`, dto),

    listByVehicle: (vehicleId: string) =>
      apiClient.get<{ data: MaintenanceRecord[]; total: number }>(`/fleet/vehicles/${vehicleId}/maintenance`),

    getUpcoming: () =>
      apiClient.get<Array<MaintenanceRecord & { vehicle?: Vehicle }>>('/fleet/maintenance/upcoming'),
  },

  fuel: {
    create: (vehicleId: string, dto: Partial<FuelRecord>) =>
      apiClient.post<FuelRecord>(`/fleet/vehicles/${vehicleId}/fuel`, dto),

    listByVehicle: (vehicleId: string) =>
      apiClient.get<{ data: FuelRecord[]; total: number }>(`/fleet/vehicles/${vehicleId}/fuel`),

    getStats: (vehicleId: string) =>
      apiClient.get<FuelStats>(`/fleet/vehicles/${vehicleId}/fuel/stats`),
  },

  hgs: {
    create: (vehicleId: string, dto: Partial<HgsRecord>) =>
      apiClient.post<HgsRecord>(`/fleet/vehicles/${vehicleId}/hgs`, dto),

    listByVehicle: (vehicleId: string, params?: { limit?: number; offset?: number }) =>
      apiClient.get<{ data: HgsRecord[]; total: number }>(`/fleet/vehicles/${vehicleId}/hgs`, { params }),

    getVehicleReport: (vehicleId: string) =>
      apiClient.get<HgsVehicleReport>(`/fleet/vehicles/${vehicleId}/hgs/report`),

    listAll: (params?: { vehicleId?: string; limit?: number; offset?: number }) =>
      apiClient.get<{ data: HgsRecord[]; total: number }>('/fleet/hgs', { params }),

    getSummary: () =>
      apiClient.get<HgsTenantSummary>('/fleet/hgs/summary'),
  },
};
