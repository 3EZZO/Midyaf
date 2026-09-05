# Midyaf Full Demo Execution Guide
**Event: Future Investment Initiative (FII) 2027**

This directory (`full_demo_package`) contains a complete, interconnected database designed to let you run the Midyaf application from start to finish for a full investor demo. 

## Entity Relationships (How it connects)
1. **The Event (`1_events.json`)**: Everything revolves around `EVT-FII-2027`.
2. **The Organizer (`2_organizers.json`)**: Sila Events (`ORG-SILA-01`) is managing the event.
3. **The Marketplace (`3_vendors.json` & `4_quotations.json`)**: The Ritz-Carlton and Royal Fleet submitted quotes for the FII event. The system shows them as `SELECTED` (this is the result of the Triple-Key Vault unlock).
4. **The Guests (`5_vip_guests.csv`)**: High-profile VIPs (like Jamie Dimon and Ray Dalio) are assigned to the event, and the system knows they are staying at The Ritz-Carlton (`VND-HTL-01`).
5. **The Fleet (`6_drivers_fleet.json`)**: The drivers from Royal Fleet (`VND-CAR-01`) are specifically linked to the VIP guests. For example, Ahmed Abdullah (`DRV-001`) is assigned to His Excellency Yasir Al-Rumayyan (`GST-001`).
6. **The Schedule (`7_itinerary.json`)**: The exact schedule of the FII event.

## How to Run the Demo in the App

### Step 1: Organizer Dashboard (The Sila View)
- Log in as the Organizer Admin (`khalid.ops@sila.com`).
- **Load the Data:** Import the JSON/CSV files into your local database.
- **Showcase:** Show the event overview, the accepted quotations, and the total cost vs. budget.

### Step 2: The Command Center (Live Tracking)
- **Showcase:** Open the Live Map. Because the drivers in `6_drivers_fleet.json` have statuses like `AT_AIRPORT` and `EN_ROUTE`, the map should populate with live pins moving from King Khalid Airport to The Ritz-Carlton.

### Step 3: VIP Guest Experience (WhatsApp / Guest App)
- **Showcase:** Open a mock WhatsApp conversation for Jamie Dimon (`GST-002`). 
- Send a message to the Midyaf Bot: *"What is my itinerary for today?"*
- The FII Itinerary (`7_itinerary.json`) should be parsed, and the bot replies with the exact schedule and venues.

### Step 4: Midyaf Super Admin (Revenue View)
- Log in as the Midyaf Super Admin.
- **Showcase:** Show the total FII 2027 billing. Midyaf automatically calculates a 10% commission on The Ritz-Carlton invoice (125,000 SAR) and a 10% commission on the Royal Fleet invoice (45,000 SAR).

By walking the investors through this specific FII 2027 dataset, they will see a functioning, breathing ecosystem rather than just abstract screens.
