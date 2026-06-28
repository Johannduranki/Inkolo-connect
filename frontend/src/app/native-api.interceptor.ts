import { HttpInterceptorFn } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';

// Current development server on the local Wi-Fi network. Replace this with the
// production HTTPS API before publishing to the Play Store.
const defaultNativeApiUrl = 'http://192.168.8.136:3000';

export const nativeApiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!Capacitor.isNativePlatform() || !request.url.startsWith('/api')) {
    return next(request);
  }

  const configuredApiUrl = localStorage
    .getItem('inkolo_native_api_url')
    ?.replace(/\/+$/, '');
  const apiUrl = configuredApiUrl || defaultNativeApiUrl;

  return next(request.clone({ url: `${apiUrl}${request.url}` }));
};
