# Quick Start: Using Environment Configuration in Your Services

## 1. Import Environment in Your Services

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/auth`;

  constructor(private http: HttpClient) {}

  login(credentials: any) {
    return this.http.post(`${this.apiUrl}/login`, credentials);
  }
}
```

## 2. Update Your Services

Replace hardcoded URLs like:
```typescript
// ❌ Before
private apiUrl = 'http://127.0.0.1:3000/api/users';

// ✅ After
import { environment } from '@environments/environment';
private apiUrl = `${environment.apiUrl}/api/users`;
```

## 3. Test Different Environments

```bash
# Development (uses localhost:3000)
npm start

# Build for production (uses environment.prod.ts)
npm run build
```

## 4. Update tsconfig.json for Path Alias (Optional but Recommended)

Add this to `tsconfig.json` for cleaner imports:

```json
{
  "compilerOptions": {
    "paths": {
      "@environments/*": ["src/environments/*"],
      "@app/*": ["src/app/*"]
    }
  }
}
```

Then you can import like:
```typescript
import { environment } from '@environments/environment';
```

## 5. Current Setup

- **Development**: Uses `http://localhost:3000` (for local development)
- **Production**: Update `src/environments/environment.prod.ts` with your deployed API URL
- **Netlify**: Set `API_URL` environment variable if needed for dynamic configuration

## Files to Update

Search your project for hardcoded URLs and update them to use `environment.apiUrl`:
- Check all services in `src/app/core/services/`
- Check API calls in components
- Check interceptors in `src/app/auth.interceptor.ts`
