# SeekReap Frontend

Frontend for SeekReap content verification platform.

## Setup

1. Clone this repository
2. Open `index.html` in browser or serve with any static server

## Configuration

Edit `js/config.js` to change API endpoint:
- Production: `https://seekreap.onrender.com`
- Development: `http://localhost:5000`

## Deployment on Render

1. Push to GitHub
2. Connect repository to Render
3. Select "Static Site"
4. Build command: `echo "Static site"`
5. Publish directory: `.`

## Structure

- `index.html` - Home page
- `upload.html` - File/URL upload
- `verification.html` - Processing status
- `results.html` - View processed video
- `dashboard.html` - Job history
- `css/` - Stylesheets
- `js/` - JavaScript files
Note: Frontend has been moved to separate repository: https://github.com/Brandsiya/seekreap-frontend
