export interface Podcast {
  id: string;
  profileDescription: string;
  audioBase64: string; // Simulating disk storage
  createdAt: string;
}

export interface Adaptation {
  id: string;
  profileDescription: string;
  content: string; // The generated text
  image?: string; // The generated illustration (Base64)
  createdAt: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  author: string;
  certified: boolean;
  enhanced: boolean;
  tags: string[];
  podcasts: Podcast[]; // Stored podcasts
  adaptations: Adaptation[]; // Stored text adaptations
  lastUpdated: string;
}

export enum UserRole {
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER',
}

export enum ConsumerFormat {
  TEXT_SUMMARY = 'TEXT_SUMMARY',
  FULL_ADAPTIVE = 'FULL_ADAPTIVE',
  PODCAST_STATIC = 'PODCAST_STATIC',
  LIVE_INTERACTION = 'LIVE_INTERACTION',
  COMIC_BOOK = 'COMIC_BOOK',
}

export interface ConsumerProfile {
  role: string; // e.g., 'Marketing', 'Engineering'
  expertise: string; // e.g., 'Novice', 'Expert'
  timeConstraint: string; // e.g., '5 minutes'
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}