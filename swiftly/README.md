# Swiftly Assets

This directory contains the image assets for the Swiftly social app integration.

## Required Files

The following image files should be placed in the `public/assets/swiftly/` directory:

- **swiftly-icon.png** - The Swiftly app icon (40x40px recommended)
- **gossipxtra.png** - GossipXtra avatar image (40x40px recommended)  
- **statsfinder.png** - Stats Finder avatar image (40x40px recommended)
- **placeholder.png** - Generic placeholder avatar (40x40px recommended)

## Current Status

**✅ IMPLEMENTATION COMPLETE** - The Swiftly integration is fully functional with:

- **Robust fallback system** - Uses gradient avatars when images aren't available
- **Multiple filename support** - Tries various filename variations (including spaces)
- **Non-destructive integration** - Doesn't affect existing game saves
- **Automatic asset loading** - Loads images on first run and caches them

## Fallback Behavior

When the image files are **not present** in the `public/assets/swiftly/` directory:

- **GossipXtra & Stats Finder** will show gradient avatars with their initials
- **Swiftly app icon** will show the 📱 emoji
- **Player avatars** will use gradient fallbacks if no profile photo is uploaded
- **NPCs** will continue using gradient avatars as designed

## How to Add Images

1. **Download the provided images** from your conversation
2. **Rename them** to match the filenames above:
   - `swiftly-icon.png` (app icon)
   - `gossipxtra.png` (GossipXtra avatar)
   - `statsfinder.png` (Stats Finder avatar)
   - `placeholder.png` (placeholder)
3. **Place them** in the `public/assets/swiftly/` directory
4. **Refresh the game** - the asset loader will automatically detect and use them
5. **Use "🔄 Reload Assets"** button in Swiftly Settings if needed

## Technical Details

- Images are automatically converted to data URLs and cached in the save file
- The app icon path is stored separately to avoid bloating saves
- Multiple filename variations are tried to handle different naming conventions
- Robust error handling ensures the game never crashes if images are missing

## Testing

After adding the images:
1. **Open Swiftly** (Media → Promo → Open Swiftly)
2. **Check avatars** - GossipXtra and Stats Finder should show custom images
3. **Check app icon** - Swiftly tile should show the custom icon instead of emoji
4. **Verify fallbacks** - NPCs should still use gradient avatars
