export type ServiceCategory = "Underhåll" | "Reparation" | "Besiktning" | "Däck" | "Övrigt";

export interface Service {
  id: string;
  category: ServiceCategory;
  name: string;
  description: string;
  priceFrom: number;
  priceTo?: number;
  durationMin: number;
  popular?: boolean;
}

export type BodyType = "kombi" | "suv" | "sedan" | "halvkombi" | "skåpbil";

export interface Bid {
  id: string;
  name: string;
  amount: number;
  at: string;
  /** Bara i admin */
  email?: string;
  phone?: string;
}

export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  title: string;
  highlight: string;
  bodyType: BodyType;
  colorName: string;
  colorHex: string;
  mileageKm: number;
  fuel: string;
  gearbox: string;
  inspected: boolean;
  conditionSummary: string;
  highlights: string[];
  thingsToNote: string[];
  description: string;
  startPrice: number;
  minIncrement: number;
  endsAt: string;
  status: CarStatus;
  soldPrice?: number;
  extended?: boolean;
  /** Bild-id:n i visningsordning (första = omslagsbild). Visas via imageUrl(). */
  images: string[];
  /** Om bilen har ett reservationspris och om det är uppnått (beloppet visas aldrig publikt). */
  hasReserve?: boolean;
  reserveMet?: boolean;
  bids: Bid[];
}

export type CarStatus = "draft" | "active" | "sold";

export interface OpeningHours {
  label: string;
  value: string;
}

export interface SiteSettings {
  phone: string;
  email: string;
  address: string;
  hours: OpeningHours[];
  announcement: { enabled: boolean; text: string; link: string; tone: "info" | "warning" };
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  text: string;
  date: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface BookingInput {
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  regNumber?: string;
  notes?: string;
}

export interface Booking extends BookingInput {
  id: string;
  createdAt: string;
}

export interface SellRequestInput {
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  description: string;
  name: string;
  phone: string;
  email: string;
}

export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
}

export interface BidInput {
  carId: string;
  name: string;
  amount: number;
  email: string;
  phone: string;
}

export interface BidResult {
  ok: boolean;
  extended?: boolean;
  message: string;
}
