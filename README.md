# Sound Empire - Next

A music career simulation game built with React and Vite.

## Features

- **Core Gameplay**: Write songs, release EPs/Albums, book gigs, and build your music career
- **Studio System**: Create and manage music projects with track selection
- **Charts & Analytics**: Track your music performance and sales
- **Event Booking**: Schedule gigs and interviews to boost popularity and reputation
- **Swiftly Social App**: Integrated social media platform for artists

## Swiftly Social App

Swiftly is a fully integrated social media app within the game that allows players to:

### Core Features
- **Post Creation**: Share text and images (costs 2⚡ energy)
- **Social Interaction**: Like and comment on posts with weekly limits
- **Profile Management**: Upload and manage profile photos
- **Follower System**: Gain followers through posting and engagement

### Official Accounts
- **@GossipXtra**: Industry gossip and music scene updates
- **@StatsFinder**: Weekly music statistics and chart data
- **NPC Community**: Generated community members with gradient avatars

### Technical Features
- **Image Handling**: Client-side image resizing (posts: 800px max, profile: 256px max)
- **Data Persistence**: All data saved to localStorage with migration support
- **Weekly Integration**: Automatic feed generation and limit resets
- **Rate Limiting**: Anti-spam protection (3 likes/3 comments per post per week)

### Navigation
- Access Swiftly from the **Media** tab → **Promo** section
- Five main tabs: Home, Compose, Profile, Discover, Settings
- Seamless integration with existing game systems

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Build for production: `npm run build`

## Game Controls

- **Progress Week**: Advances time and processes events
- **Studio**: Create and manage music projects
- **Media**: Access charts and Swiftly social app
- **Activities**: Book gigs and interviews
- **Settings**: Game options and profile management

## Save System

- Automatic localStorage persistence
- Export/Import functionality
- Migration support for existing saves
- Non-destructive data updates

## Development

Built with:
- React 18
- Vite
- Tailwind CSS
- Vanilla JavaScript (no external frameworks)
