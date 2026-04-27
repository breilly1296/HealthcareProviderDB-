# Database Update Guide

## Updated Database Connection

The new database connection details:
- **Host**: `35.223.46.51`
- **Port**: `5432`
- **Database**: `providerdb`
- **Username**: `postgres`
- **Password**: `vMp$db2026!xKq9Tz`

## Steps to Update Cloud Run Deployment

### 1. Update Google Cloud Secret Manager

The Cloud Run deployment uses Google Cloud Secret Manager for the DATABASE_URL. Update it with:

```bash
# Set the new database URL
echo "postgresql://postgres:vMp\$db2026!xKq9Tz@35.223.46.51:5432/providerdb" | gcloud secrets versions add DATABASE_URL --data-file=-
```

Or use the provided script:
```bash
bash scripts/update-database-secret.sh
```

### 2. Verify Secret Update

```bash
gcloud secrets versions list DATABASE_URL
```

### 3. Push to GitHub to Trigger Auto-Deploy

Once the secret is updated, any push to the `main` branch will trigger an automatic deployment to Cloud Run with the new database connection.

```bash
git add .
git commit -m "Update database configuration"
git push origin main
```

## Local Development

The local `.env` file has been updated at:
- `packages/backend/.env`

This is used for local development only and is not committed to git (in .gitignore).

## Database Status

✅ **NY.csv import completed**: 276,621 records successfully imported
- Name parsing working correctly (first_name, last_name, credential)
- Date conversion successful (MM/DD/YYYY → PostgreSQL DATE format)
- 99.8% field population rate

> **Note (2026-04-26):** the NY.csv import described above was performed
> against the pre-`practice_locations` schema, before the location split
> on 2026-01-14. The scripts that did it (`import-csv-copy.ts`,
> `import-csv-simple.ts`, `import-filtered-csv.ts`, `import-npi.ts`,
> `import-npi-direct.ts`) have been archived under `scripts/archive/` —
> they no longer match the current schema. The note above is preserved
> for historical reference; the import is **not reproducible today**
> without first writing a replacement script that targets the current
> `providers` + `practice_locations` shape.

## Next Steps

After deployment:
1. Verify backend connects to new database
2. Test API endpoints
3. **TODO**: import remaining state CSV files. The original importers are
   archived (see note above and `scripts/archive/README.md`). A new
   bulk-import script needs to be written against the current schema
   before this step is reachable. The active incremental paths
   (`enrich-providers-nppes.ts`, `import-enrichment-csv.ts`) cover
   maintenance, not initial bulk load.
