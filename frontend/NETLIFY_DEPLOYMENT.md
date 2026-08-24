# Netlify Deployment Guide for Inkolo-Connect Frontend

## ✅ Pre-Deployment Checklist

### 1. **Environment Configuration**
- [ ] Update `API_URL` in `.env.production` to point to your production backend
- [ ] Ensure all sensitive credentials are configured as Netlify environment variables (not in code)

### 2. **Backend API Configuration**
The frontend currently proxies requests to `http://127.0.0.1:3000`. You need to:
- [ ] Deploy your backend to a server (e.g., Heroku, AWS, Azure, etc.)
- [ ] Update the API URL in your Angular service files or environment files
- [ ] Ensure CORS is properly configured on your backend to accept requests from your Netlify domain

### 3. **Build Verification**
- [ ] Run `npm install` locally
- [ ] Run `npm run build` to verify the build succeeds
- [ ] Check that `dist/duranki-login` folder contains your built app

### 4. **Angular Configuration**
- [ ] Verify `angular.json` output path is `dist/duranki-login`
- [ ] Check that all environment-specific URLs are properly configured
- [ ] Ensure lazy-loaded modules are properly configured

## 📋 Deployment Steps

### Option A: Deploy via Git (Recommended)
1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [Netlify Dashboard](https://app.netlify.com)
3. Click "New site from Git"
4. Select your repository
5. **Build command**: `npm install && npm run build`
6. **Publish directory**: `dist/duranki-login`
7. Add environment variables in Netlify Dashboard under "Site settings" → "Build & Deploy" → "Environment"
8. Click "Deploy"

### Option B: Deploy via Netlify CLI
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy
netlify deploy --prod
```

### Option C: Deploy via Manual Upload
1. Run `npm run build` locally
2. Go to [Netlify Drop](https://app.netlify.com/drop)
3. Drag and drop the `dist/duranki-login` folder

## 🔧 Important Configuration Details

### netlify.toml
- **Build Command**: Installs dependencies and builds the Angular app
- **Publish Directory**: `dist/duranki-login` - where the production build output goes
- **Redirects**: All routes are redirected to `index.html` (SPA requirement)

### Environment Variables to Set in Netlify Dashboard
1. Go to **Site settings** → **Build & deploy** → **Environment**
2. Add these variables (adjust URLs based on your backend):
   - `API_URL`: Your backend API base URL
   - `NODE_ENV`: Set to `production`

### CORS Configuration
Your backend MUST allow requests from your Netlify domain:
```javascript
// Example for Node.js/Express
const cors = require('cors');
app.use(cors({
  origin: ['https://your-netlify-domain.netlify.app', 'http://localhost:4200'],
  credentials: true
}));
```

## 🚀 Post-Deployment

### Testing
- [ ] Test all API calls work with the deployed backend URL
- [ ] Test authentication flow
- [ ] Test all major features
- [ ] Check browser console for errors
- [ ] Test on mobile devices

### Monitoring
- Enable Netlify Analytics: **Site settings** → **General** → **Netlify Analytics**
- Monitor build logs: **Deploys** → Recent deploy → **View deploy log**

### Performance Optimization
- [ ] Enable brotli compression in netlify.toml (Netlify does this by default)
- [ ] Use Netlify cache for faster builds:
```toml
[build]
  cache = ["node_modules", ".angular"]
```

## 🔗 Backend API Integration

Update your Angular services to use the environment variable:

```typescript
import { environment } from '@app/environment';

export class YourService {
  private apiUrl = environment.apiUrl + '/api/endpoint';
  
  constructor(private http: HttpClient) {}
}
```

Create/update environment files:
- `src/environments/environment.ts` (development)
- `src/environments/environment.prod.ts` (production)

```typescript
// environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://your-backend-api.com'
};
```

## 📚 Useful Netlify Resources
- [Netlify Documentation](https://docs.netlify.com)
- [Angular + Netlify Guide](https://docs.netlify.com/frameworks-and-platforms/angular/)
- [Redirects Guide](https://docs.netlify.com/routing/redirects/)
- [Environment Variables](https://docs.netlify.com/configure-builds/environment-variables/)

## ⚠️ Common Issues

### 404 Errors on Refresh
**Fixed by**: The SPA redirect rule in `netlify.toml` already handles this

### API Calls Returning 404
**Check**: 
- Is your backend deployed and running?
- Is CORS configured correctly?
- Is `API_URL` environment variable set correctly?

### Build Fails
**Check**:
- Run `npm install && npm run build` locally to see the exact error
- Verify all dependencies are in `package.json`
- Check Node.js version compatibility (Angular 20 needs Node 18+)

### Blank Page After Deploy
**Check**:
- Look at browser console for JavaScript errors
- Check Netlify deploy logs
- Verify `dist/duranki-login` path is correct in netlify.toml
