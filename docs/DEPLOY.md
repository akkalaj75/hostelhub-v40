# 🚀 HOSTELHUB DEPLOYMENT GUIDE

## PREREQUISITES

- Firebase CLI installed
- Git repository set up
- Domain name (optional but recommended)
- SSL certificate (via Firebase Hosting or Let's Encrypt)

---

## STEP 1: FIREBASE PROJECT SETUP
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project
firebase init

# Select:
# - Firestore (rules and indexes)
# - Hosting
# - Storage (rules)

# Follow prompts
```

---

## STEP 2: DEPLOY FIRESTORE RULES
```bash
# Deploy rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Verify in Firebase Console
# https://console.firebase.google.com/project/YOUR_PROJECT/firestore/rules
```

---

## STEP 3: CONFIGURE HOSTING

**firebase.json:**
```json
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Frame-Options",
            "value": "SAMEORIGIN"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "X-XSS-Protection",
            "value": "1; mode=block"
          },
          {
            "key": "Referrer-Policy",
            "value": "strict-origin-when-cross-origin"
          }
        ]
      }
    ]
  }
}
```

---

## STEP 4: BUILD & DEPLOY
```bash
# Test locally
firebase serve

# Deploy to production
firebase deploy --only hosting

# Custom domain (optional)
firebase hosting:channel:deploy production --expires 30d
```

---

## STEP 5: CUSTOM DOMAIN (Optional)

1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Enter your domain (e.g., hostelhub.app)
4. Follow DNS configuration instructions
5. Wait for SSL certificate (automatic)

---

## STEP 6: ENVIRONMENT VARIABLES

**For sensitive config (if needed):**

Create `.env.production`:
```
VITE_FIREBASE_API_KEY=your_key_here
VITE_FIREBASE_PROJECT_ID=your_project_id
```

Update `src/config.js` to use environment variables.

---

## STEP 7: MONITORING SETUP

### Firebase Performance Monitoring
```javascript
// Add to index.html before closing </body>
import { getPerformance } from 'firebase/performance';
const perf = getPerformance(app);
```

### Google Analytics
```html
<!-- Add to index.html <head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Error Tracking (Sentry)
```bash
npm install @sentry/browser

# src/main.js
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: "production"
});
```

---

## STEP 8: SECURITY CHECKLIST

- [ ] Firebase rules deployed and tested
- [ ] Email verification enforced
- [ ] HTTPS enabled (automatic with Firebase)
- [ ] Security headers configured
- [ ] API keys restricted (Firebase Console)
- [ ] Firestore indexes created
- [ ] No console.log in production
- [ ] Error messages don't leak sensitive data

---

## STEP 9: PERFORMANCE OPTIMIZATION

### Enable Caching
```html
<!-- Add to index.html -->
<meta http-equiv="Cache-Control" content="public, max-age=31536000">
```

### Lazy Load Images
```javascript
<img loading="lazy" src="..." alt="...">
```

### Minify Assets
```bash
# If using build tool
npm run build --minify
```

---

## STEP 10: POST-DEPLOYMENT

1. Test all features in production
2. Monitor Firebase Console for errors
3. Check Analytics for user activity
4. Set up alerts for:
   - High error rate
   - Unusual traffic spikes
   - Quota limits approaching

---

## MAINTENANCE

### Daily
- Check error logs
- Monitor user reports
- Review analytics

### Weekly
- Database cleanup (old sessions)
- Performance review
- Feature usage analysis

### Monthly
- Security audit
- Cost analysis
- Backup review

---

## ROLLBACK PROCEDURE
```bash
# List deployments
firebase hosting:releases:list

# Rollback to previous
firebase hosting:rollback

# Or deploy specific version
firebase deploy --only hosting --version X
```

---

## SCALING CONSIDERATIONS

### When to Scale
- 1000+ concurrent users
- Firestore reads > 100k/day
- WebRTC connections timing out

### How to Scale
1. Enable Firebase Blaze plan (pay-as-you-go)
2. Add Cloud Functions for:
   - Rate limiting
   - Automated moderation
   - Analytics processing
3. Consider dedicated TURN servers
4. Implement CDN for static assets

---

## COST ESTIMATION

### Free Tier (Spark)
- 1GB storage
- 10GB bandwidth/month
- 50k reads, 20k writes, 20k deletes per day

### Blaze Plan (Paid)
| Users | Estimated Cost/Month |
|-------|---------------------|
| 100   | Free               |
| 500   | $5-10              |
| 1,000 | $15-25             |
| 5,000 | $50-100            |
| 10,000| $150-250           |

**Note:** Costs vary based on usage patterns.

---

## SUPPORT & TROUBLESHOOTING

### Common Issues

**1. "Permission denied" errors**
→ Check Firestore rules are deployed

**2. Slow matchmaking**
→ Verify indexes are created

**3. WebRTC connection failures**
→ Check TURN server configuration

**4. Email verification not working**
→ Verify Firebase Auth email settings

### Getting Help

- Firebase Status: https://status.firebase.google.com/
- Stack Overflow: [firebase] tag
- GitHub Issues: (your repo)
- Email: support@hostelhub.app

---

**DEPLOYMENT COMPLETE! 🎉**