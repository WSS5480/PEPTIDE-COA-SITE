/* 360 University: the built-in courses. Seeded into the database once (then edited in Admin → 360 University).
   Lesson body markup (the same the editor uses):
     ## Heading            a sub-heading
     - item                a bullet
     Term :: meaning       a vocabulary row
     ! text                a highlighted note
     [diagram:torso]       the organ map (also: skin, arm)
     blank line            new paragraph
   Question: { q, options: [...], correct: index, why, lesson: lesson number (1-based) to review if missed } */

const C = [];

/* ------------------------------------------------------------------ */
C.push({
  key: "gen-product", title: "General Product Knowledge", icon: "🧬", audience: "surgical",
  blurb: "The building blocks behind everything we sell: biologics, hemostasis, staplers and energy, wound care, how products are regulated and billed, and how to work in the OR.",
  minutes: 35, pass_pct: 80, test_count: 12, max_attempts: 2,
  lessons: [
    { title: "Biologics 101: where grafts come from", body: `Most of our biologic products are allografts: human tissue from a screened donor, processed by a tissue bank and used in another patient.

## Graft types
Allograft :: Tissue from one human donor used in another person. Our amniotic, umbilical cord and dermal grafts are allografts.
Autograft :: The patient's own tissue moved from one place to another (for example a skin graft from the thigh).
Xenograft :: Tissue from an animal source, such as porcine (pig) or bovine (cow).
Synthetic :: Man-made material with no donor tissue.

## Birth tissue
Amniotic and umbilical cord grafts come from placentas donated after planned C-section births, with the mother's consent. The donor is screened and tested before the tissue is released.
- Amnion: the thin innermost layer of the amniotic sac.
- Chorion: the thicker layer just outside the amnion.
- Umbilical cord: a thicker, more durable tissue.
These tissues naturally act as a protective barrier and contain collagen and other structural proteins, which is why surgeons use them to cover and protect tissue.

## How they are processed and stored
Dehydrated :: Dried and sterilized. Stored at room temperature and ready to open (Stability Biologics grafts such as AmnioCore and AmchoPlast).
Cryopreserved :: Frozen to protect the tissue's natural biology; kept frozen and thawed before use (Clarix and Neox cryopreserved lines).
Decellularized :: Donor cells are removed, leaving the collagen scaffold (DermaPure dCELL Technology).
Flowable :: A particulate form that is mixed and injected or applied into irregular spaces (the "Flo" products).

! Never describe a graft as a drug, and never promise it will heal anything. Describe what it is and how surgeons use it.` },
    { title: "How our products are regulated", body: `Knowing the regulatory status tells you what you can and cannot say about a product.

HCT/P (361) :: Human cells, tissues and cellular and tissue-based products that are minimally manipulated and used for their natural (homologous) purpose. Regulated by FDA under Section 361 of the Public Health Service Act and 21 CFR Part 1271. Most amniotic and dermal allografts fall here.
AATB :: American Association of Tissue Banks. Tissue banks follow its standards for donor screening, testing and processing.
FDA-cleared (510(k)) :: The device was shown to be substantially equivalent to a device already on the market. UltraMIST and APIS are FDA-cleared.
FDA-approved (PMA) :: Premarket approval, the most rigorous device pathway, with clinical data. HEMOBLAST Bellows is FDA-approved.
Indication :: The specific use a product is cleared or approved for.
Off-label :: Using a product outside its labeled indication. A surgeon may choose to; a rep must never promote it.

! Only talk about a product's labeled indications and the materials the manufacturer has approved for reps. If a surgeon asks about another use, say you will connect them with the manufacturer's medical team.` },
    { title: "Hemostasis, staplers and energy", body: `## Hemostasis
Hemostasis is the body's process of stopping bleeding. In surgery, topical hemostats help when normal methods (pressure, sutures, cautery) are impractical.
- Mechanical hemostats (gelatin, collagen, oxidized cellulose) give the blood a surface to clot on.
- Active hemostats contain thrombin, which speeds up the clotting reaction.
- HEMOBLAST Bellows combines collagen, thrombin and chondroitin sulfate in a ready-to-use powder with a bellows applicator, as an adjunct to hemostasis for minimal to moderate bleeding.

## Staplers
Linear cutting stapler :: Fires rows of staples on both sides and cuts between them, so tissue is divided and sealed in one step (easyEndo).
Circular stapler (EEA) :: End-to-end anastomosis stapler. Joins two ends of bowel in a circle; the anvil sits in one end and the stapler in the other (easyCS). Common in colorectal surgery.
Anastomosis :: A surgical connection between two structures, such as two ends of the colon.
Anastomotic leak :: A breakdown of that connection. One of the most feared complications of colorectal surgery. AmnioSurge ASG is a ring-shaped amnion/chorion graft that fits with the EEA anvil to protect the anastomotic site.

## Energy
Monopolar electrosurgery :: Current passes from the instrument through the patient to a grounding pad.
Bipolar / vessel sealing :: Current passes only between the two jaws, sealing vessels with less spread.
Ultrasonic :: The blade vibrates at very high speed to cut and coagulate at the same time (SoniCure; VariCure combines ultrasonic and electrosurgical energy).` },
    { title: "Minimally invasive surgery", body: `Minimally invasive surgery (MIS) is done through small incisions instead of one large opening.

Laparoscopic :: The surgeon works through small ports with a camera and long instruments; the abdomen is inflated with CO2 (insufflation) to create working space.
Robotic :: The surgeon controls robotic arms from a console (for example the da Vinci system). Many of our colorectal, GYN and urology cases are robotic.
Open :: A traditional single larger incision.
Trocar / port :: The tube placed through the abdominal wall that instruments pass through.
Suction / irrigation :: Removing fluid and rinsing the surgical field. ACSIS is an adjustable-curve sleeve that improves reach and control in complex laparoscopic and robotic cases.
Gastric calibration tube :: A tube placed in the stomach during bariatric surgery (such as sleeve gastrectomy) to size the new stomach. Endolumik adds fluorescence so the surgeon can see the tube clearly on camera.

! MIS shortens recovery, which is why hospitals push for it. Products that make MIS easier or safer are an easy conversation with robotic surgeons.` },
    { title: "Wound care basics and billing", body: `Our outpatient line serves wound clinics, podiatry and physicians treating chronic wounds.

Acute wound :: A new wound (surgical incision, trauma) expected to heal in a normal timeframe.
Chronic wound :: A wound that fails to progress through normal healing, typically open for about four weeks or more.
DFU :: Diabetic foot ulcer.
VLU :: Venous leg ulcer, caused by poor blood return from the legs.
Pressure injury :: Damage from prolonged pressure, often over bony areas such as the heel or sacrum.
Debridement :: Removing dead or unhealthy tissue from a wound so it can heal.
Skin substitute :: A graft or matrix applied to a wound to protect and cover it (amniotic grafts, dermal grafts).

## Billing codes
- Skin substitutes are billed with HCPCS Q-codes. AmchoPlast is Q4316; Amnio Quad-Core is Q4294.
- APIS uses A2010.
- Coverage rules change often. Never promise a clinic that a product will be paid; point them to the manufacturer's reimbursement support.

## Therapy devices
UltraMIST delivers non-contact, painless low-frequency ultrasound therapy for chronic and acute wounds such as DFUs and VLUs. It is FDA-cleared.` },
    { title: "Working in the hospital and OR", body: `## Getting in
- Hospitals require vendor credentialing (badge systems such as Symplr/Vendormate or Reptrax) with current vaccines, background checks and training. No credentials, no entry.
- Check in at the vendor desk every visit and follow the hospital's rules about where vendors may go.

## In the OR
- You never touch the sterile field. Stay outside the blue drapes and the path between the back table and the patient.
- Wear the hospital's scrubs, hat, mask and shoe covers. Keep your phone silent.
- Speak when the surgeon or staff asks. Have your product, sizes and instructions ready before the case.
OR roles :: Surgeon, first assistant, scrub tech (handles sterile instruments), circulator (the non-sterile nurse who opens products and runs the room), anesthesia.

## Patient privacy (HIPAA)
! Never write patient names, medical record numbers, dates of birth or other identifiers in the portal, texts or email. Log the surgeon, facility, procedure and product only.

## Ethics
- Follow the AdvaMed Code of Ethics and the manufacturers' policies on meals and gifts.
- Payments and meals given to physicians can be reportable under the Sunshine Act (Open Payments). When in doubt, ask before you spend.

## 360 Medical workflow
- Log every case in the portal: surgeon, facility, product, units, net sales, status.
- Add the invoice (photo or PDF) when the case is billed; the COO approves it.
- Keep surgeon preference cards current.
- Submit your WCU every week by Thursday 5:00 PM.` },
  ],
  questions: [
    { q: "An allograft is tissue that comes from…", options: ["The patient's own body", "Another human donor", "An animal such as a pig or cow", "A synthetic material"], correct: 1, why: "Allograft = human donor to a different human.", lesson: 1 },
    { q: "Which layer of the amniotic sac is the innermost?", options: ["Chorion", "Amnion", "Dermis", "Umbilical cord"], correct: 1, why: "The amnion is the thin innermost layer; the chorion sits outside it.", lesson: 1 },
    { q: "A cryopreserved graft is…", options: ["Stored at room temperature", "Kept frozen and thawed before use", "Made from synthetic polymers", "Always injected"], correct: 1, why: "Cryopreserved grafts are frozen to protect the tissue's biology.", lesson: 1 },
    { q: "Which product is described as a decellularized dermal allograft?", options: ["DermaPure", "HEMOBLAST Bellows", "UltraMIST", "AmnioSurge ASG"], correct: 0, why: "DermaPure is decellularized human dermis processed with dCELL Technology.", lesson: 1 },
    { q: "Most amniotic and dermal allografts are regulated by FDA as…", options: ["Prescription drugs", "361 HCT/Ps", "Class III PMA devices", "Dietary supplements"], correct: 1, why: "Minimally manipulated tissue for homologous use is regulated under Section 361 / 21 CFR 1271.", lesson: 2 },
    { q: "What does 'FDA-cleared' mean?", options: ["Approved through a PMA with clinical trials", "Shown substantially equivalent to a device already on the market (510(k))", "Not reviewed by FDA", "Approved as a drug"], correct: 1, why: "Clearance is the 510(k) pathway; approval is the PMA pathway.", lesson: 2 },
    { q: "A surgeon asks how to use a product for something outside its label. You should…", options: ["Explain how other surgeons do it", "Say it works the same way", "Stick to the labeled indications and offer to connect them with the manufacturer's medical team", "Send them your own notes"], correct: 2, why: "Reps never promote off-label use.", lesson: 2 },
    { q: "HEMOBLAST Bellows contains…", options: ["Collagen, thrombin and chondroitin sulfate", "Amnion and chorion", "Manuka honey and hydroxyapatite", "Oxidized cellulose only"], correct: 0, why: "It is a ready-to-use powder of collagen, thrombin and chondroitin sulfate.", lesson: 3 },
    { q: "An EEA (circular) stapler is used to…", options: ["Close skin", "Join two ends of bowel in a circle (anastomosis)", "Seal blood vessels with ultrasound", "Calibrate the stomach"], correct: 1, why: "EEA = end-to-end anastomosis.", lesson: 3 },
    { q: "Why does AmnioSurge ASG matter in colorectal surgery?", options: ["It replaces the stapler", "It is a ring-shaped graft that fits with the EEA anvil to protect the anastomotic site", "It stops bleeding from the liver", "It is used to close the skin"], correct: 1, why: "It protects the colorectal anastomosis, where a leak is a feared complication.", lesson: 3 },
    { q: "An ultrasonic energy device works by…", options: ["Passing current through a grounding pad", "Vibrating a blade at high speed to cut and coagulate", "Freezing tissue", "Applying suction"], correct: 1, why: "Ultrasonic devices cut and coagulate with high-speed vibration.", lesson: 3 },
    { q: "During laparoscopic surgery the abdomen is inflated with…", options: ["Oxygen", "Saline", "Carbon dioxide (CO2)", "Air"], correct: 2, why: "CO2 insufflation creates working space.", lesson: 4 },
    { q: "Endolumik helps surgeons during…", options: ["Hand surgery", "Bariatric surgery, by making the gastric calibration tube visible", "Wound debridement", "Spinal fusion"], correct: 1, why: "It is a fluorescence-guided gastric calibration tube.", lesson: 4 },
    { q: "A chronic wound is generally one that…", options: ["Is less than a week old", "Fails to progress through normal healing, typically open about four weeks or more", "Is on the face", "Was caused by surgery"], correct: 1, why: "Chronic wounds stall in the healing process.", lesson: 5 },
    { q: "DFU stands for…", options: ["Deep fascia ulcer", "Diabetic foot ulcer", "Dermal flap unit", "Distal fracture union"], correct: 1, why: "DFU = diabetic foot ulcer.", lesson: 5 },
    { q: "Skin substitutes are usually billed with…", options: ["CPT surgery codes only", "HCPCS Q-codes", "ICD-10 diagnosis codes only", "NDC drug numbers"], correct: 1, why: "Skin substitutes use HCPCS Q-codes, such as Q4316 for AmchoPlast.", lesson: 5 },
    { q: "In the OR, a rep should…", options: ["Hand products directly to the surgeon over the sterile field", "Never touch the sterile field and stay out of the sterile path", "Help drape the patient", "Open sterile products on the back table"], correct: 1, why: "Reps stay outside the sterile field at all times.", lesson: 6 },
    { q: "Which of these may you enter in the portal?", options: ["The patient's name", "The patient's date of birth", "The surgeon, facility, procedure and product", "The medical record number"], correct: 2, why: "Never record patient identifiers (HIPAA).", lesson: 6 },
    { q: "Who is the circulator?", options: ["The surgeon's first assistant", "The non-sterile nurse who opens products and runs the room", "The anesthesiologist", "The hospital buyer"], correct: 1, why: "The circulator is the non-sterile nurse.", lesson: 6 },
    { q: "Your WCU is due…", options: ["Monday 9:00 AM", "Thursday 5:00 PM", "Friday at noon", "The last day of the month"], correct: 1, why: "WCUs are due every Thursday by 5:00 PM Central.", lesson: 6 },
  ],
});

/* ------------------------------------------------------------------ */
C.push({
  key: "prod-surgical", title: "Product Knowledge: Hospital & Surgical", icon: "🏥", audience: "surgical",
  blurb: "Every hospital and surgical line we carry: what it is, who makes it, which surgeons use it and in which cases.",
  minutes: 30, pass_pct: 80, test_count: 12, max_attempts: 2,
  lessons: [
    { title: "AmnioSurge ASG and AmnioSurge SX (Merakris)", body: `## AmnioSurge ASG
A sterile, full-thickness amnion/chorion allograft in a patent-pending ring configuration built to integrate with the EEA anvil. It provides a protective barrier at colorectal anastomotic sites.
- Texas exclusive for 360 Medical; now launching.
- Cases: low anterior resection (LAR), sigmoid colectomy, robotic colorectal cases with a circular-stapled anastomosis.
- Who to call on: colorectal and general surgeons who do stapled anastomoses.

## AmnioSurge SX
An amnion/chorion surgical allograft from the same family, used as a protective barrier covering for internal and external tissue defects.

! Lead with the problem: anastomotic leak. Ask the surgeon how they protect their anastomosis today.` },
    { title: "Birth-tissue surgical grafts (Stability, BioStem)", body: `## AmnioCore / Tri-Core / Quad-Core Surgical (Stability Biologics)
Dehydrated amniotic membrane allografts in two-, three- and four-layer configurations. Large, repositionable grafts with no cryopreservation required.
- More layers = a thicker, more robust graft.
- Room-temperature storage makes them easy for hospitals to stock.

## Clarix 100 / Flo / Cord 1K (BioStem Technologies)
Cryopreserved birth-tissue allografts processed to maintain the tissue's innate biology.
- Clarix 100: membrane (sheet).
- Clarix Flo: flowable, for irregular spaces.
- Clarix Cord 1K: umbilical cord, a thicker tissue.
- Cryopreserved: kept frozen, thawed before use.` },
    { title: "DermaPure and the Xtant portfolio", body: `## DermaPure Advanced Dermal Allograft (Tissue Regenix)
Decellularized human dermis processed with dCELL Technology for soft tissue reinforcement and coverage.
- Ambient (room-temperature) storage.
- Comes standard, Non-Oriented and Meshed. Meshed grafts have slits so they can stretch and let fluid drain.

## Xtant Medical portfolio
Biologics and spinal implant systems.
- Biologics: allogeneic growth factors, viable bone matrix and demineralized bone matrix (DBM), used to support bone healing.
- Spinal fixation: cervical (neck), thoracolumbar (mid and low back) and sacroiliac (where the spine meets the pelvis).

## HEMOBLAST Bellows (Xtant)
A ready-to-use powder of collagen, thrombin and chondroitin sulfate in a bellows applicator, an adjunct to hemostasis for minimal to moderate bleeding. FDA-approved. No mixing or prep, so it is ready when bleeding starts.` },
    { title: "Instruments: Endolumik, ACSIS, EziSurg, Surgnova", body: `## Endolumik Gastric Calibration Tube
Fluorescence-guided gastric calibration lets surgeons precisely see the calibration tube during laparoscopic and robotic bariatric procedures, such as sleeve gastrectomy.

## ACSIS Suction / Irrigation Sleeve (Platform Innovations)
An Adjustable Curve Suction Irrigation Sleeve that improves safety, precision and access in complex laparoscopic and robotic surgery.

## EziSurg Medical stapling
- easyEndo: powered and manual endoscopic linear cutting staplers.
- easyCS: circular staplers.
- Used in general, bariatric, GI and thoracic procedures.

## Surgnova energy
- SoniCure: ultrasonic scalpel.
- VariCure: ultrasonic and electrosurgical system in one.
- Vessel sealers and bipolar laparoscopic instruments.` },
    { title: "Skeletal Dynamics: upper-extremity implants", body: `Implants designed only for upper-extremity surgery: hand, wrist, elbow and humerus.

GEMINUS :: Volar plating system for distal radius (wrist) fractures. "Volar" means the palm side.
FREEFIX :: Fixation system for the hand and wrist.
ALIGN :: Radial head system for the elbow.

- Who to call on: hand surgeons and orthopedic surgeons who treat wrist, elbow and hand injuries.
- The distal radius fracture is one of the most common fractures, often from a fall on an outstretched hand.

[diagram:arm]` },
  ],
  questions: [
    { q: "AmnioSurge ASG is designed to integrate with…", options: ["A laparoscopic port", "The EEA anvil", "A bone plate", "A wound vac"], correct: 1, why: "Its ring configuration fits with the EEA anvil at colorectal anastomoses.", lesson: 1 },
    { q: "Which manufacturer makes AmnioSurge?", options: ["Merakris Therapeutics", "BioStem Technologies", "Stability Biologics", "Xtant Medical"], correct: 0, why: "AmnioSurge is from Merakris Therapeutics.", lesson: 1 },
    { q: "Which surgeons are the first target for AmnioSurge ASG?", options: ["Hand surgeons", "Colorectal and general surgeons doing stapled anastomoses", "Dermatologists", "Podiatrists"], correct: 1, why: "It protects colorectal anastomoses.", lesson: 1 },
    { q: "AmnioCore, Tri-Core and Quad-Core differ mainly in…", options: ["The number of layers", "The donor species", "How they are frozen", "Their billing code only"], correct: 0, why: "Two-, three- and four-layer configurations.", lesson: 2 },
    { q: "Stability Biologics' surgical grafts are stored…", options: ["Frozen at -80°C", "At room temperature; no cryopreservation required", "In liquid nitrogen", "In the patient's refrigerator"], correct: 1, why: "They are dehydrated and need no cryopreservation.", lesson: 2 },
    { q: "Clarix Flo is…", options: ["A sheet graft", "A flowable form", "An umbilical cord graft", "A stapler"], correct: 1, why: "'Flo' products are flowable.", lesson: 2 },
    { q: "Clarix grafts are…", options: ["Dehydrated", "Cryopreserved", "Synthetic", "Animal-derived"], correct: 1, why: "Clarix is a cryopreserved birth-tissue line.", lesson: 2 },
    { q: "DermaPure is processed with…", options: ["dCELL Technology", "Gamma freezing", "Manuka honey", "Fluorescence"], correct: 0, why: "DermaPure is decellularized with dCELL Technology.", lesson: 3 },
    { q: "A meshed dermal graft has slits so it can…", options: ["Be injected", "Stretch and let fluid drain", "Be frozen", "Conduct electricity"], correct: 1, why: "Meshing lets the graft expand and drain.", lesson: 3 },
    { q: "The Xtant portfolio includes…", options: ["Gastric calibration tubes", "Biologics and spinal implant systems", "Ultrasound therapy", "Allergy testing"], correct: 1, why: "Growth factors, bone matrix/DBM and spinal fixation.", lesson: 3 },
    { q: "HEMOBLAST Bellows is indicated as…", options: ["A permanent implant", "An adjunct to hemostasis for minimal to moderate bleeding", "A wound dressing for ulcers", "A bone graft"], correct: 1, why: "It is an adjunct to hemostasis.", lesson: 3 },
    { q: "Endolumik is used in…", options: ["Bariatric procedures such as sleeve gastrectomy", "Hand surgery", "Spine surgery", "Wound clinics"], correct: 0, why: "It is a gastric calibration tube.", lesson: 4 },
    { q: "easyCS from EziSurg is a…", options: ["Linear cutting stapler", "Circular stapler", "Ultrasonic scalpel", "Suction sleeve"], correct: 1, why: "easyCS = circular staplers; easyEndo = linear cutting.", lesson: 4 },
    { q: "SoniCure is a…", options: ["Circular stapler", "Ultrasonic scalpel", "Hemostatic powder", "Bone plate"], correct: 1, why: "SoniCure is Surgnova's ultrasonic scalpel.", lesson: 4 },
    { q: "ACSIS improves…", options: ["Suction and irrigation access in laparoscopic and robotic surgery", "Bone healing", "Wound billing", "Stomach sizing"], correct: 0, why: "It is an adjustable-curve suction/irrigation sleeve.", lesson: 4 },
    { q: "Skeletal Dynamics implants are only for…", options: ["The spine", "The upper extremity: hand, wrist, elbow and humerus", "The knee and hip", "The skull"], correct: 1, why: "They are designed exclusively for the upper extremity.", lesson: 5 },
    { q: "GEMINUS is used for…", options: ["Distal radius (wrist) fractures, with a volar plate", "Radial head replacement", "Spinal fusion", "Colorectal anastomosis"], correct: 0, why: "GEMINUS is a volar plating system for the distal radius.", lesson: 5 },
    { q: "'Volar' means…", options: ["The back of the hand", "The palm side", "The thumb side", "The elbow"], correct: 1, why: "Volar = palm side; dorsal = back of the hand.", lesson: 5 },
    { q: "ALIGN is a system for the…", options: ["Radial head (elbow)", "Ankle", "Shoulder joint", "Spine"], correct: 0, why: "ALIGN is Skeletal Dynamics' radial head system.", lesson: 5 },
  ],
});

/* ------------------------------------------------------------------ */
C.push({
  key: "prod-wound", title: "Product Knowledge: Wound Care & Clinic", icon: "🩹", audience: "wound",
  blurb: "Our outpatient and wound care line plus the clinic program: grafts, therapy devices, codes and the right accounts to call on.",
  minutes: 20, pass_pct: 80, test_count: 10, max_attempts: 2,
  lessons: [
    { title: "Wound grafts", body: `## AmchoPlast (Stability Biologics)
A sterile, dehydrated amniotic/chorionic membrane allograft used as a protective, bioactive barrier for chronic and acute wounds. HCPCS Q4316.

## Amnio Quad-Core / Tri-Core / Pro+ (Stability Biologics)
Multi-layer dehydrated amniotic membrane allografts for coverage of chronic and acute wounds, in a full range of sizes. Quad-Core is Q4294.

## Neox 100 / Flo / Cord 1K & RT (BioStem Technologies)
Amniotic membrane and umbilical cord allografts in sheet, flowable and cord formats for chronic and hard-to-heal wounds.
- Neox RT is the room-temperature version. It is one of our most-used products in surgical cases too.

! Sizes matter: wound grafts are ordered by size (for example 2x2 cm, 4x4 cm). Know the sizes the clinic uses most.` },
    { title: "Therapy and bioengineered products", body: `## UltraMIST Ultrasound Therapy (Sanuwave)
Non-contact, painless low-frequency ultrasound therapy for chronic and acute wounds such as diabetic foot ulcers and venous leg ulcers. FDA-cleared.
- Non-contact means the device does not touch the wound bed.
- Used as a series of treatments in the clinic.

## APIS Bioengineered Wound Product (SweetBio)
Made with a collagen derivative, Manuka honey and hydroxyapatite. FDA-cleared for the management of chronic and acute wounds. HCPCS A2010.` },
    { title: "Clinic program and calling on clinics", body: `## Allergy Testing Program (Nationwide Allergy)
A turnkey in-office allergy testing and immunotherapy program that helps practices bring allergy care to their own patients.
- Good fit for primary care, ENT and pediatric practices.

## Calling on wound clinics
- Decision makers: wound care physicians, podiatrists, nurse practitioners and clinic managers.
- Know the clinic's patient mix (DFUs, VLUs, pressure injuries) and which products they already use.
- Coverage and documentation rules change often. Never promise payment; connect the clinic with the manufacturer's reimbursement team.` },
  ],
  questions: [
    { q: "AmchoPlast is a…", options: ["Dehydrated amniotic/chorionic membrane allograft", "Ultrasound device", "Bone plate", "Stapler"], correct: 0, why: "AmchoPlast is a dehydrated amnion/chorion allograft.", lesson: 1 },
    { q: "AmchoPlast's HCPCS code is…", options: ["A2010", "Q4316", "Q4294", "J1100"], correct: 1, why: "AmchoPlast = Q4316.", lesson: 1 },
    { q: "Amnio Quad-Core's HCPCS code is…", options: ["Q4294", "Q4316", "A2010", "None"], correct: 0, why: "Quad-Core = Q4294.", lesson: 1 },
    { q: "Neox grafts come in which formats?", options: ["Tablets and capsules", "Sheet, flowable and cord", "Spray only", "Plates and screws"], correct: 1, why: "Neox comes as membrane, flowable and umbilical cord.", lesson: 1 },
    { q: "Who makes Neox?", options: ["BioStem Technologies", "Sanuwave", "SweetBio", "Merakris"], correct: 0, why: "Neox is a BioStem Technologies line.", lesson: 1 },
    { q: "UltraMIST is…", options: ["A contact ultrasound probe used in surgery", "Non-contact, painless ultrasound therapy for wounds", "A hemostatic powder", "An allergy test"], correct: 1, why: "UltraMIST is non-contact low-frequency ultrasound.", lesson: 2 },
    { q: "APIS contains…", options: ["Collagen derivative, Manuka honey and hydroxyapatite", "Thrombin and collagen", "Amnion and chorion", "Silver only"], correct: 0, why: "APIS = collagen derivative + Manuka honey + hydroxyapatite.", lesson: 2 },
    { q: "UltraMIST and APIS are both…", options: ["FDA-approved drugs", "FDA-cleared", "Not regulated", "Tissue allografts"], correct: 1, why: "Both are FDA-cleared.", lesson: 2 },
    { q: "The Allergy Testing Program is best pitched to…", options: ["Colorectal surgeons", "Primary care, ENT and pediatric practices", "Hand surgeons", "Hospital ORs"], correct: 1, why: "It brings allergy care in-office for practices.", lesson: 3 },
    { q: "A clinic asks if a graft will definitely be paid by insurance. You…", options: ["Promise it will", "Explain coverage varies and connect them with the manufacturer's reimbursement team", "Say it never is", "Tell them to bill it as a drug"], correct: 1, why: "Never promise payment.", lesson: 3 },
    { q: "Wound grafts are usually ordered by…", options: ["Weight", "Size (for example 2x2 cm, 4x4 cm)", "Color", "Volume in mL only"], correct: 1, why: "Sheets are ordered by size.", lesson: 1 },
  ],
});

/* ------------------------------------------------------------------ */
C.push({
  key: "anatomy", title: "General Anatomy", icon: "🫀", audience: "all",
  blurb: "Where the organs are and how to talk about the body: directions, the abdominal quadrants, the GI tract, the pelvis, skin and the arm.",
  minutes: 30, pass_pct: 80, test_count: 12, max_attempts: 2,
  lessons: [
    { title: "Finding your way around the body", body: `Anatomy always describes the patient in the anatomical position: standing, facing you, palms forward.

! The patient's right is on YOUR left when you face them. Every chart, scan and surgeon uses the patient's right and left.

## Directions
Anterior / ventral :: Front.
Posterior / dorsal :: Back.
Superior / cranial :: Toward the head.
Inferior / caudal :: Toward the feet.
Medial :: Toward the midline of the body.
Lateral :: Away from the midline, toward the side.
Proximal :: Closer to where a limb attaches to the body (the shoulder end of the arm).
Distal :: Farther from where a limb attaches (the hand end). A distal radius fracture is at the wrist.
Superficial / deep :: Closer to / farther from the skin surface.
Supine / prone :: Lying face up / face down.

## Planes
Sagittal :: Divides left and right.
Coronal (frontal) :: Divides front and back.
Transverse (axial) :: Divides top and bottom; CT scans are usually shown in this plane.` },
    { title: "The chest and abdomen: where the organs are", body: `The diaphragm, a dome-shaped muscle, separates the chest (thorax) from the abdomen.

## Chest
- Heart: in the middle of the chest (mediastinum), tilted toward the left.
- Lungs: on either side. The right lung has three lobes; the left lung has two, making room for the heart.

## The four abdominal quadrants
Surgeons divide the abdomen into four quadrants with a vertical and a horizontal line through the belly button.
RUQ (right upper) :: Liver (largest part), gallbladder, part of the duodenum, head of the pancreas, right kidney, hepatic flexure of the colon.
LUQ (left upper) :: Stomach, spleen, body and tail of the pancreas, left kidney, splenic flexure of the colon.
RLQ (right lower) :: Cecum, appendix, start of the ascending colon, right ovary and fallopian tube, right ureter.
LLQ (left lower) :: Descending and sigmoid colon, left ovary and fallopian tube, left ureter.
Midline / pelvis :: Bladder, uterus (in women), prostate (in men, below the bladder), rectum.

[diagram:torso]

## Behind the abdominal lining (retroperitoneal)
The kidneys, adrenal glands, ureters, most of the pancreas, the aorta and vena cava, and the ascending and descending colon sit behind the peritoneum (the lining of the abdomen).` },
    { title: "The digestive tract and colon", body: `Food travels: mouth → esophagus → stomach → small intestine → large intestine → rectum → anus.

## Small intestine (about 20 feet)
Duodenum :: First part, right after the stomach. Bile and pancreatic juices enter here.
Jejunum :: Middle part.
Ileum :: Last part; joins the large intestine at the cecum.

## Large intestine (colon, about 5 feet)
Cecum :: The pouch at the start, in the RLQ; the appendix hangs from it.
Ascending colon :: Runs up the right side.
Transverse colon :: Crosses the upper abdomen.
Descending colon :: Runs down the left side.
Sigmoid colon :: S-shaped segment in the LLQ that leads to the rectum.
Rectum :: The last 12–15 cm before the anus.

## Why it matters to us
- A sigmoid colectomy removes the sigmoid colon; a low anterior resection (LAR) removes part of the rectum. Both usually end with a stapled anastomosis, which is where AmnioSurge ASG is used.
- An ileostomy brings the ileum through the abdominal wall; an ileostomy reversal reconnects it.
- Liver, gallbladder and pancreas help digestion: the liver makes bile, the gallbladder stores it, and the pancreas makes digestive enzymes and insulin.` },
    { title: "The pelvis, kidneys and bladder", body: `## Urinary system
Kidneys :: Two bean-shaped organs against the back muscles, under the lower ribs. They filter blood and make urine.
Ureters :: Tubes carrying urine from each kidney to the bladder.
Bladder :: Stores urine, low in the pelvis behind the pubic bone.
Urethra :: Carries urine out of the body.
Prostate :: In men, a gland just below the bladder that surrounds the urethra. A prostatectomy removes it.

## Female pelvis
Uterus :: Sits between the bladder (in front) and the rectum (behind).
Ovaries :: One on each side of the uterus.
Fallopian tubes :: Connect the ovaries to the uterus.
- A myomectomy removes fibroids and keeps the uterus; a hysterectomy removes the uterus.` },
    { title: "Skin and the upper extremity", body: `## Skin layers (wound care)
Epidermis :: The thin outer layer; a barrier with no blood vessels.
Dermis :: Beneath it; collagen, blood vessels, nerves, hair follicles and sweat glands. Dermal grafts replace this layer.
Hypodermis (subcutaneous) :: Fat and connective tissue under the dermis.
- Partial-thickness wound: through the epidermis into part of the dermis.
- Full-thickness wound: through the dermis into the fat or deeper.

[diagram:skin]

## The arm and hand
Humerus :: The upper arm bone, from shoulder to elbow.
Radius :: Forearm bone on the thumb side. Its head is at the elbow and its wide end at the wrist.
Ulna :: Forearm bone on the pinky side.
Carpals :: The eight small wrist bones.
Metacarpals :: The five bones of the palm.
Phalanges :: The finger bones.

[diagram:arm]` },
  ],
  questions: [
    { q: "When you face a patient, the patient's right side is on…", options: ["Your right", "Your left", "Above you", "It depends on the surgeon"], correct: 1, why: "Always use the patient's right and left; facing them, their right is on your left.", lesson: 1 },
    { q: "'Distal' means…", options: ["Toward the midline", "Farther from where a limb attaches to the body", "Toward the head", "Toward the front"], correct: 1, why: "Distal = farther from the attachment point.", lesson: 1 },
    { q: "'Medial' means…", options: ["Toward the midline", "Toward the side", "Toward the back", "Toward the feet"], correct: 0, why: "Medial = toward the midline.", lesson: 1 },
    { q: "A patient lying face up is…", options: ["Prone", "Supine", "Lateral", "Inverted"], correct: 1, why: "Supine = face up; prone = face down.", lesson: 1 },
    { q: "What separates the chest from the abdomen?", options: ["The peritoneum", "The diaphragm", "The pancreas", "The ribs only"], correct: 1, why: "The diaphragm.", lesson: 2 },
    { q: "Most of the liver is in the…", options: ["RUQ", "LUQ", "RLQ", "LLQ"], correct: 0, why: "The liver sits mainly in the right upper quadrant.", lesson: 2 },
    { q: "The gallbladder is in the…", options: ["LUQ", "RUQ", "LLQ", "Pelvis"], correct: 1, why: "It sits under the liver in the RUQ.", lesson: 2 },
    { q: "The spleen is in the…", options: ["RUQ", "RLQ", "LUQ", "Pelvis"], correct: 2, why: "The spleen is in the left upper quadrant.", lesson: 2 },
    { q: "The appendix is usually in the…", options: ["LLQ", "RLQ", "LUQ", "RUQ"], correct: 1, why: "It hangs from the cecum in the right lower quadrant.", lesson: 2 },
    { q: "The sigmoid colon is in the…", options: ["RUQ", "RLQ", "LLQ", "LUQ"], correct: 2, why: "The sigmoid colon is in the left lower quadrant.", lesson: 3 },
    { q: "Which lung has three lobes?", options: ["The left", "The right", "Both", "Neither"], correct: 1, why: "Right = 3 lobes, left = 2.", lesson: 2 },
    { q: "Which organs are retroperitoneal (behind the abdominal lining)?", options: ["Stomach and spleen", "Kidneys and most of the pancreas", "Liver and gallbladder", "Small intestine"], correct: 1, why: "Kidneys, adrenals, ureters, most of the pancreas, aorta and vena cava.", lesson: 2 },
    { q: "Put these in order of how food travels:", options: ["Stomach → duodenum → jejunum → ileum → colon", "Stomach → ileum → jejunum → duodenum → colon", "Duodenum → stomach → colon → ileum", "Colon → ileum → stomach"], correct: 0, why: "Duodenum, jejunum, ileum, then the colon.", lesson: 3 },
    { q: "The appendix hangs from the…", options: ["Rectum", "Cecum", "Sigmoid colon", "Duodenum"], correct: 1, why: "The cecum is the pouch at the start of the large intestine.", lesson: 3 },
    { q: "A low anterior resection (LAR) removes part of the…", options: ["Stomach", "Rectum", "Liver", "Kidney"], correct: 1, why: "LAR removes part of the rectum, then reconnects with an anastomosis.", lesson: 3 },
    { q: "The organ that stores bile is the…", options: ["Liver", "Pancreas", "Gallbladder", "Spleen"], correct: 2, why: "The liver makes bile; the gallbladder stores it.", lesson: 3 },
    { q: "In men, the prostate sits…", options: ["Above the kidneys", "Just below the bladder, around the urethra", "Behind the stomach", "Next to the spleen"], correct: 1, why: "The prostate is below the bladder.", lesson: 4 },
    { q: "In women, the uterus sits between the…", options: ["Liver and stomach", "Bladder and rectum", "Kidneys", "Lungs"], correct: 1, why: "Bladder in front, rectum behind.", lesson: 4 },
    { q: "Which skin layer contains collagen, blood vessels and nerves?", options: ["Epidermis", "Dermis", "Hypodermis", "Fascia"], correct: 1, why: "The dermis.", lesson: 5 },
    { q: "The radius is the forearm bone on the…", options: ["Pinky side", "Thumb side", "Back of the hand", "Upper arm"], correct: 1, why: "Radius = thumb side; ulna = pinky side.", lesson: 5 },
    { q: "The upper arm bone is the…", options: ["Femur", "Humerus", "Ulna", "Clavicle"], correct: 1, why: "The humerus.", lesson: 5 },
  ],
});

/* ------------------------------------------------------------------ */
C.push({
  key: "vocab", title: "Medical Vocabulary", icon: "📖", audience: "all",
  blurb: "Decode medical words from their parts, and know the procedure, OR and wound terms you will hear every day.",
  minutes: 25, pass_pct: 80, test_count: 12, max_attempts: 2,
  lessons: [
    { title: "Building blocks: prefixes, roots and suffixes", body: `Most medical words are built from parts. Learn the parts and you can decode words you have never seen.
Example: chole + cyst + ectomy = gallbladder removal (cholecystectomy).

## Suffixes (endings)
-ectomy :: Surgical removal (appendectomy).
-otomy :: Cutting into (laparotomy: opening the abdomen).
-ostomy :: Creating an opening to the outside (colostomy, ileostomy).
-plasty :: Surgical repair or reshaping (hernioplasty).
-pexy :: Fixing in place (rectopexy).
-rrhaphy :: Suturing (herniorrhaphy).
-scopy :: Looking inside with a scope (colonoscopy, laparoscopy).
-itis :: Inflammation (appendicitis).
-algia :: Pain.
-emia :: Blood condition (anemia).
-oma :: Tumor or mass (lipoma).

## Prefixes (beginnings)
hyper- / hypo- :: Above / below normal.
tachy- / brady- :: Fast / slow.
peri- :: Around (perineal, perianal).
endo- / intra- :: Inside / within.
sub- :: Below.
trans- :: Across or through.
pre- / post- :: Before / after (post-op).
hemi- :: Half (hemicolectomy).
dys- :: Difficult or abnormal.
neo- :: New.` },
    { title: "Body-part roots", body: `gastr/o :: Stomach (gastrectomy).
hepat/o :: Liver.
chole / cholecyst/o :: Bile / gallbladder.
pancreat/o :: Pancreas.
splen/o :: Spleen.
enter/o :: Small intestine.
col/o, colon/o :: Colon.
proct/o, rect/o :: Rectum.
nephr/o, ren/o :: Kidney.
cyst/o :: Bladder.
hyster/o :: Uterus.
my/o :: Muscle (myomectomy: removing fibroids, which are muscle tumors of the uterus).
lapar/o :: Abdominal wall (laparoscopic).
thorac/o :: Chest.
cardi/o :: Heart.
pneum/o, pulmon/o :: Lung.
oste/o :: Bone.
arthr/o :: Joint.
derm/o :: Skin.
angi/o, vas/o :: Vessel.
lip/o :: Fat.` },
    { title: "Procedures you will see in our cases", body: `Colectomy :: Removal of part or all of the colon. Sigmoid colectomy removes the sigmoid; hemicolectomy removes the right or left half.
Low anterior resection (LAR) :: Removal of the upper rectum and sigmoid, reconnected with a stapled anastomosis.
Ileostomy reversal :: Reconnecting the ileum and closing the stoma.
Fistulotomy :: Opening a fistula (an abnormal tunnel, often near the anus) so it can heal.
Pilonidal cyst excision :: Removing an infected cyst near the tailbone.
Nephrectomy :: Kidney removal.
Prostatectomy :: Prostate removal.
Myomectomy :: Removal of uterine fibroids, keeping the uterus.
Hysterectomy :: Removal of the uterus.
Cholecystectomy :: Gallbladder removal.
Sleeve gastrectomy :: Bariatric surgery that removes most of the stomach, leaving a sleeve.
ORIF :: Open reduction and internal fixation: setting a fracture and holding it with plates or screws.
Debridement :: Removing dead tissue from a wound.
Anastomosis :: Joining two hollow structures (bowel to bowel).
Dehiscence :: A wound or incision coming apart.
Seroma :: A pocket of clear fluid under an incision.` },
    { title: "OR, wound and everyday abbreviations", body: `OR :: Operating room.
ASC :: Ambulatory surgery center (outpatient surgery).
PACU :: Post-anesthesia care unit (recovery).
NPO :: Nothing by mouth before surgery.
Pre-op / post-op :: Before / after surgery.
Hx / Dx / Tx / Rx :: History / diagnosis / treatment / prescription.
EEA :: End-to-end anastomosis (circular stapler).
GIA :: Gastrointestinal anastomosis (linear stapler).
MIS :: Minimally invasive surgery.
DFU / VLU :: Diabetic foot ulcer / venous leg ulcer.
CPT :: Codes for procedures.
HCPCS :: Codes for supplies, devices and skin substitutes (Q-codes).
ICD-10 :: Diagnosis codes.
PO :: Purchase order (hospital buying paperwork).
Preference card :: The surgeon's list of instruments, supplies and products for a procedure.
Granulation tissue :: Healthy red, bumpy tissue that fills a healing wound.
Eschar :: Dead, dry, dark tissue over a wound.
Exudate :: Fluid that drains from a wound.` },
  ],
  questions: [
    { q: "The suffix '-ectomy' means…", options: ["Cutting into", "Surgical removal", "Creating an opening", "Repair"], correct: 1, why: "-ectomy = removal.", lesson: 1 },
    { q: "The suffix '-ostomy' means…", options: ["Removal", "Inflammation", "Creating an opening to the outside", "Suturing"], correct: 2, why: "-ostomy = surgical opening (colostomy, ileostomy).", lesson: 1 },
    { q: "'Laparotomy' means…", options: ["Removing the liver", "Opening (cutting into) the abdomen", "Looking at the colon", "Repairing a hernia"], correct: 1, why: "lapar = abdominal wall; -otomy = cutting into.", lesson: 1 },
    { q: "'-plasty' means…", options: ["Surgical repair or reshaping", "Pain", "Tumor", "Removal"], correct: 0, why: "-plasty = repair.", lesson: 1 },
    { q: "'Tachy-' means…", options: ["Slow", "Fast", "Half", "Around"], correct: 1, why: "Tachycardia = fast heart rate.", lesson: 1 },
    { q: "'Hemi-' as in hemicolectomy means…", options: ["Blood", "Half", "Liver", "Twice"], correct: 1, why: "Hemicolectomy removes half of the colon.", lesson: 1 },
    { q: "'Hepat/o' refers to the…", options: ["Heart", "Liver", "Kidney", "Stomach"], correct: 1, why: "Hepat = liver.", lesson: 2 },
    { q: "'Nephr/o' refers to the…", options: ["Nerves", "Kidney", "Lung", "Bladder"], correct: 1, why: "Nephrectomy = kidney removal.", lesson: 2 },
    { q: "'Hyster/o' refers to the…", options: ["Uterus", "Stomach", "Gallbladder", "Bone"], correct: 0, why: "Hysterectomy = removal of the uterus.", lesson: 2 },
    { q: "A cholecystectomy removes the…", options: ["Colon", "Gallbladder", "Bladder", "Kidney"], correct: 1, why: "Chole (bile) + cyst (sac) + ectomy = gallbladder removal.", lesson: 2 },
    { q: "A myomectomy…", options: ["Removes the uterus", "Removes fibroids and keeps the uterus", "Removes a kidney", "Repairs a muscle in the arm"], correct: 1, why: "Myomectomy removes fibroids only.", lesson: 3 },
    { q: "ORIF stands for…", options: ["Open reduction and internal fixation", "Operating room infection", "Oral rehydration", "Outpatient referral form"], correct: 0, why: "Setting a fracture and fixing it with hardware.", lesson: 3 },
    { q: "An anastomosis is…", options: ["A wound infection", "A connection joining two hollow structures", "A type of anesthesia", "A skin graft"], correct: 1, why: "For example, joining two ends of bowel.", lesson: 3 },
    { q: "Dehiscence means…", options: ["A fluid pocket", "A wound coming apart", "A fast heartbeat", "Healthy healing tissue"], correct: 1, why: "Dehiscence = the incision separates.", lesson: 3 },
    { q: "PACU is…", options: ["The pre-op holding area", "The recovery unit after anesthesia", "The pharmacy", "The billing office"], correct: 1, why: "Post-anesthesia care unit.", lesson: 4 },
    { q: "NPO means…", options: ["No pain observed", "Nothing by mouth", "New patient order", "Normal post-op"], correct: 1, why: "Nil per os: nothing by mouth.", lesson: 4 },
    { q: "Skin substitutes are coded with…", options: ["CPT", "HCPCS (Q-codes)", "ICD-10", "NDC"], correct: 1, why: "HCPCS Q-codes.", lesson: 4 },
    { q: "Granulation tissue is…", options: ["Dead black tissue", "Healthy red, bumpy tissue filling a healing wound", "Fluid draining from a wound", "Scar tissue"], correct: 1, why: "It is a good sign in a healing wound.", lesson: 4 },
    { q: "A surgeon's preference card lists…", options: ["Their patients", "The instruments, supplies and products they want for a procedure", "Their schedule", "Their billing codes"], correct: 1, why: "Keep preference cards current so our product is pulled for every case.", lesson: 4 },
  ],
});

/* ------------------------------------------------------------------ */
C.push({
  key: "peptides", title: "Peptides: Products, COAs & Selling Right", icon: "🧪", audience: "peptide",
  blurb: "What research peptides are, how to read a certificate of analysis, how they are stored and shipped, our catalog, and how to sell them the right way.",
  minutes: 25, pass_pct: 80, test_count: 10, max_attempts: 2,
  lessons: [
    { title: "What peptides are", body: `A peptide is a short chain of amino acids, the building blocks of proteins, linked by peptide bonds. Peptides are generally shorter than proteins (roughly 2 to 50 amino acids).

Amino acid :: The building block; there are 20 standard ones.
Lyophilized :: Freeze-dried. Our peptides ship as a lyophilized powder in a sealed vial.
Strength (mg) :: The amount of peptide in the vial, such as 10 mg. The same peptide often comes in more than one strength.
Blend :: A vial with more than one peptide. The product page lists what is in each blend.
Manufacturer :: We carry the same peptide from more than one maker, each with its own price and its own lab reports.

! Our products are sold as research products. You do not give medical advice, dosing instructions or treatment claims. Anyone asking how to use a product on themselves or a patient should be told to speak with their licensed healthcare provider.` },
    { title: "Reading a certificate of analysis (COA)", body: `A COA is the lab report that shows what is in a specific batch. Every product page and the Lab reports page link to the COAs we have on file.

Third-party lab :: An independent lab, not the manufacturer, tested the sample (for example Janoshik).
Batch / lot number :: Ties the report to a production run. The batch on the vial should match the COA.
Purity (HPLC) :: High-performance liquid chromatography shows what percent of the sample is the target peptide. Higher is better; many reports show 98–99%+.
Identity (mass spectrometry) :: Confirms the molecule's weight matches the peptide named on the label.
Quantity :: How many milligrams were actually measured in the vial, compared with the labeled strength.
Test date :: When the batch was tested.

## How to use COAs with customers
- Send the link to the exact product and batch they are buying.
- If a customer asks about a batch that has no COA yet, say so honestly and offer the closest batch that has one.` },
    { title: "Storage, shipping and handling", body: `- Lyophilized vials are stable for shipping. Store them cool, dry and away from light; refrigerate for longer storage.
- Keep vials sealed until used and follow the storage notes on the product page and label.
- Orders ship or go out for local delivery as set in the store; customers see the options at checkout.
- Report damaged or missing items right away so the office can replace them.

! Do not repackage, relabel or split vials. Customers get the sealed vial with its batch label so it can be matched to its COA.` },
    { title: "Selling the right way in our store", body: `## How customers buy
- Customers sign in with the PIN they are given to see their pricing. Some customers have their own markup set by the office.
- You can add customers and place orders for them in the rep app. Every order from your customers earns your commission, whether you or the customer placed it.
- Discount codes are set up by the office; only share codes you have been given.

## What you can say
- What the product is, its strength and manufacturer, price, availability and its lab results.
- How to order, pay, ship and track.

## What you must not say
- No claims that a product treats, cures, prevents or improves any condition.
- No dosing, mixing or injection instructions.
- No sales to anyone under the store's minimum age.

## Our catalog
{{catalog}}` },
  ],
  questions: [
    { q: "A peptide is…", options: ["A short chain of amino acids", "A type of vitamin", "A plant extract", "A mineral"], correct: 0, why: "Peptides are short amino acid chains.", lesson: 1 },
    { q: "'Lyophilized' means…", options: ["Liquid", "Freeze-dried", "Frozen solid", "Mixed with water"], correct: 1, why: "Our vials ship as freeze-dried powder.", lesson: 1 },
    { q: "A customer asks how much they should inject. You…", options: ["Give them a common dose", "Tell them to speak with their licensed healthcare provider; you do not give dosing advice", "Send a dosing chart", "Tell them to follow what friends do"], correct: 1, why: "Reps never give dosing or medical advice.", lesson: 1 },
    { q: "Which statement is acceptable?", options: ["'This will heal your injury.'", "'The 10 mg vial tested at 99% purity on its third-party COA.'", "'It cures inflammation.'", "'It's safe for everyone.'"], correct: 1, why: "Stick to facts about the product and its lab results.", lesson: 4 },
    { q: "On a COA, HPLC shows…", options: ["The shipping date", "The purity percentage", "The price", "The customer's name"], correct: 1, why: "HPLC measures purity.", lesson: 2 },
    { q: "Mass spectrometry on a COA confirms…", options: ["The peptide's identity (molecular weight)", "The vial color", "The expiration date", "The order number"], correct: 0, why: "Mass spec confirms identity.", lesson: 2 },
    { q: "The batch number on the vial should…", options: ["Be removed", "Match the batch on the COA", "Be different from the COA", "Be handwritten by the rep"], correct: 1, why: "The batch ties the vial to its lab report.", lesson: 2 },
    { q: "A third-party COA means…", options: ["The manufacturer tested it", "An independent lab tested it", "The customer tested it", "No one tested it"], correct: 1, why: "Third-party = independent lab.", lesson: 2 },
    { q: "How should lyophilized vials be stored?", options: ["In direct sunlight", "Cool, dry, away from light; refrigerated for longer storage", "In a hot car", "Opened to air out"], correct: 1, why: "Keep sealed vials cool, dry and dark.", lesson: 3 },
    { q: "A customer wants you to split a vial into two. You…", options: ["Do it", "Decline: vials stay sealed with their batch label", "Charge extra to do it", "Relabel both halves"], correct: 1, why: "Never repackage or relabel.", lesson: 3 },
    { q: "Your commission is earned on…", options: ["Only orders you place yourself", "Every order from your customers, whether you or they placed it", "Only discounted orders", "Only shipped orders over $500"], correct: 1, why: "Every order from your customers counts.", lesson: 4 },
    { q: "Customers see their pricing after…", options: ["Calling the office", "Signing in with their PIN", "Placing an order", "Emailing you"], correct: 1, why: "They sign in with the PIN they are given.", lesson: 4 },
  ],
});

module.exports = { COURSES: C };
