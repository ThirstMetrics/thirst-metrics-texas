# Data Ingestion Notes

## File Locations

All data files should be in the `data/` directory:

- `data/Texas_Counties.csv` - County reference data
- `data/Metroplex.xlsx` - Metroplex mapping (Excel format)
- `data/ProprietaryData.xlsx` - Location enrichments (Excel format)
- `data/Sales_Tax.csv` - Sales tax data

## Ingestion Order

The ingestion scripts **must** be run in this order:

1. **Counties** (`ingest-counties.ts`) - Required first
2. **Metroplexes** (`ingest-metroplexes.ts`) - Required second
3. **Sales Tax** (`ingest-sales-tax.ts`) - Optional, depends on counties
4. **Enrichments** (`ingest-enrichments.ts`) - Optional
5. **Beverage Receipts** (`ingest-beverage-receipts.ts`) - Required, depends on counties

## Data Format Requirements

### Texas_Counties.csv
- Format: `County,Number`
- Example: `Anderson County,1`
- County names include "County" suffix (will be stripped during ingestion)
- Numbers are 1-254 (Texas county numbering system)

### Metroplex.xlsx
- Columns: `ZIP Code`, `City/Town`, `County`, `Metroplex`
- ZIP codes must be 5 digits
- One row per ZIP code

### ProprietaryData.xlsx
- Columns: `TABC_Permit_Number`, `Clean_DBA_Name`, `Ownership_Group`, `Industry_Segment`, `Clean_Up_Notes`
- First 6 columns (id, location_name, etc.) are desktop editing fields and are ignored
- Only enrichment fields are imported

### Sales_Tax.csv
- Columns: `Type`, `Name`, `Current Rate`, `Net Payment This Period`, etc.
- Only rows with `Type='COUNTY'` are imported
- County names are mapped to county codes using the counties table

## Environment Variables

Required for beverage receipts ingestion:
- `TEXAS_APP_TOKEN` - Texas.gov API token
- `TEXAS_API_BASE_URL` - API endpoint (default: https://data.texas.gov/resource/nalx-2893.json)
- `INGEST_LOOKBACK_MONTHS` - Number of months to fetch (default: 37 for staging)

## Troubleshooting

### "File not found" errors
- Verify data files are in `data/` directory
- Check file names match exactly (case-sensitive on some systems)

### "County mapping failed"
- Ensure counties are ingested first
- Check county names match between files (case-insensitive matching)

### "Invalid ZIP code"
- Metroplex script validates ZIP codes are exactly 5 digits
- Invalid ZIPs are skipped with a warning

### API rate limiting
- Beverage receipts script includes retry logic
- Add your `TEXAS_APP_TOKEN` to reduce rate limits
- For large initial loads, consider running during off-peak hours

## Performance Notes

- **Counties**: ~254 records, completes in seconds
- **Metroplexes**: ~1,000+ records, completes in seconds
- **Sales Tax**: Varies, typically completes in under a minute
- **Enrichments**: Varies, typically completes in under a minute
- **Beverage Receipts**: ~850k+ records (37 months), takes 10-30 minutes depending on API speed

## Initial Load vs Monthly Updates

### Initial Load (Staging)
- 37 months of beverage receipts data
- All reference data (counties, metroplexes)
- All enrichments
- Sales tax data

### Monthly Updates (Production)
- ~23,000 new beverage receipt records per month
- Updated enrichments (if any)
- New sales tax data (if available)

Run only the beverage receipts script for monthly updates:
```bash
npm run ingest:beverage-receipts
```
