# Midyaf Triple-Key Vault Architecture
**Anti-Corruption & Secure Vendor Selection Protocol**

## 1. The Problem
During the bidding process for major events, event organizers (like Sila) receive highly lucrative quotations from vendors (Hotels, Transport Fleets, Catering). Historically, corruption occurs when rogue employees within the organizer company leak competitor prices to favored vendors, allowing those vendors to undercut the competition and win the contract unfairly.

## 2. The Midyaf Solution: Multi-Party Authorization
Midyaf introduces the **Triple-Key Vault**. Quotations submitted by vendors are cryptographically sealed upon submission. They cannot be opened, viewed, or compared by *anyone* (not even Midyaf administrators) until the official "Quotation Opening Time". 

To open the vault, **three authorized parties must simultaneously authenticate**.

### The Three Keys
1. **Organizer Key A:** Operations Manager (e.g., Sila Ops)
2. **Organizer Key B:** Procurement/Finance Manager (e.g., Sila Finance)
3. **Midyaf Key:** Compliance/Account Manager

## 3. Technical Implementation Flow

### Phase A: Quotation Submission (Blind Bidding)
1. Vendor submits quotation via `POST /api/vendors/quote`.
2. Midyaf backend encrypts the pricing data (e.g., AES-256-GCM) using a unique symmetric key generated for that specific event.
3. The symmetric key is then split into three shards using **Shamir's Secret Sharing (SSS)**. 
4. The three shards are distributed to the accounts of the three Key Holders.
5. In the UI, the quotation appears as `[ENCRYPTED - AWAITING UNLOCK]`.

### Phase B: The Simultaneous Unlock (The 5-Minute Window)
1. **Initiation:** Organizer Key A logs into the dashboard and clicks "Initiate Vault Unlock" for the GTS-2027 Event.
2. **WebSocket Room Creation:** A temporary Socket.IO room `vault_unlock_GTS2027` is created.
3. **Push Notifications:** Key B and Key C receive high-priority push notifications on their Midyaf mobile apps: *"Urgent: Sila Operations has requested to open quotations for GTS 2027. Tap to authorize."*
4. **Live Dashboard:** Key A sees a live "Waiting Room" UI with three avatars. Key A's avatar is green (Authorized). Keys B and C are grey (Pending).
5. **Simultaneous Authorization:** 
   - Key B opens the app, uses biometric authentication (FaceID/TouchID), and approves. Key B's avatar turns green.
   - Key C opens the app, reviews the compliance checklist, uses biometric auth, and approves. Key C's avatar turns green.
   - *Requirement:* All three keys must be turned within a 5-minute countdown. If the timer expires, the session is voided, and the process must be re-initiated.

### Phase C: Unmasking & Immutable Audit
1. **Reconstruction:** Once the WebSocket server confirms 3/3 authorizations, the backend reconstructs the symmetric key from the three shards.
2. **Decryption:** The quotations are decrypted and saved in plaintext to the database.
3. **Audit Log:** An immutable ledger entry is created:
   ```json
   {
      "event": "VAULT_UNLOCKED",
      "timestamp": "2027-09-01T10:00:00Z",
      "event_id": "GTS-2027",
      "authorized_by": [
         {"role": "Sila Ops", "ip": "192.168.1.1", "device": "iPhone 15"},
         {"role": "Sila Finance", "ip": "192.168.1.2", "device": "MacBook Pro"},
         {"role": "Midyaf Auditor", "ip": "10.0.0.5", "device": "iPad Pro"}
      ]
   }
   ```
4. **UI Update:** The dashboard refreshes instantly for Sila, revealing all competitor prices transparently. The organizer can now make a fair, uncorrupted selection.
