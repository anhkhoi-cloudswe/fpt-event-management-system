export interface GuestVideoItem {
  id: string
  title: string
  description?: string
  url: string
  thumbnailUrl?: string
  order: number
}

export interface HeroImageItem {
  id: string
  title: string
  image: string
  order: number
}

export interface BrandPartnerItem {
  id: string
  name: string
  logoUrl: string
  website?: string
  order: number
}

export interface SectionVisibilityConfig {
  hero: boolean
  videos: boolean
  brands: boolean
  events: boolean
  stats: boolean
  features: boolean
  footer: boolean
}

export interface FrontendConfigData {
  videos: GuestVideoItem[]
  videoShowcaseBadge?: string
  videoShowcaseTitle?: string
  videoShowcaseSubtitle?: string
  heroImages?: HeroImageItem[]
  brands?: BrandPartnerItem[]
  brandSectionTitle?: string
  brandSectionSubtitle?: string
  sections: SectionVisibilityConfig
  heroAnnouncementText?: string
}
