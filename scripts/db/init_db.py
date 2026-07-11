import sqlite3
import json
import subprocess
import os
import unicodedata

def normalize_vietnamese(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    return text.lower()

def main():
    os.makedirs("db", exist_ok=True)
    db_path = "db/crm.db"
    schema_path = "db/schema.sql"
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    with open(schema_path, "r", encoding="utf-8") as f:
        cursor.executescript(f.read())
        
    print("Extracting base data from crmData.js...")
    result = subprocess.run(
        ["node", "-e", "import('./src/services/crmData.js').then(m => console.log(JSON.stringify({customers: m.customers, opportunities: m.opportunities, interactions: m.interactions, campaigns: m.campaigns})))"],
        capture_output=True, text=True, cwd=os.path.abspath("."), encoding="utf-8"
    )
    if result.returncode != 0:
        print("Error reading crmData.js:", result.stderr)
        return
        
    base_data = json.loads(result.stdout)
    
    def import_customers(customers):
        for c in customers:
            norm_name = normalize_vietnamese(c.get("name", ""))
            cursor.execute("""
                INSERT OR IGNORE INTO customers (id, name, normalized_name, segment, savings_product, savings_amount_vnd, maturity_date, risk_profile, location)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (c["id"], c["name"], norm_name, c.get("segment"), c.get("savingsProduct"), c.get("savingsAmountVnd"), c.get("maturityDate"), c.get("riskProfile"), c.get("location")))
            
    def import_opportunities(opportunities):
        for o in opportunities:
            cursor.execute("""
                INSERT OR IGNORE INTO opportunities (id, customer_id, product, stage, score, estimated_value_vnd)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (o["id"], o["customerId"], o.get("product"), o.get("stage"), o.get("score"), o.get("estimatedValueVnd")))
            
    def import_interactions(interactions):
        for i in interactions:
            cursor.execute("""
                INSERT OR IGNORE INTO interactions (id, customer_id, channel, occurred_at, outcome, note)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (i["id"], i["customerId"], i.get("channel"), i.get("timestamp"), i.get("outcome"), i.get("note")))
    
    print("Importing customers...")
    import_customers(base_data.get("customers", []))
    
    try:
        with open("src/data/mock/large_customers.json", "r", encoding="utf-8-sig") as f:
            import_customers(json.load(f))
    except FileNotFoundError:
        pass
        
    print("Importing opportunities...")
    import_opportunities(base_data.get("opportunities", []))
    
    try:
        with open("src/data/mock/large_opportunities.json", "r", encoding="utf-8-sig") as f:
            import_opportunities(json.load(f))
    except FileNotFoundError:
        pass

    print("Importing interactions...")
    import_interactions(base_data.get("interactions", []))
    
    try:
        with open("src/data/mock/large_interactions.json", "r", encoding="utf-8-sig") as f:
            import_interactions(json.load(f))
    except FileNotFoundError:
        pass
        
    print("Importing campaigns...")
    for cp in base_data.get("campaigns", []):
        cursor.execute("""
            INSERT OR IGNORE INTO campaigns (id, name, target_segment, status)
            VALUES (?, ?, ?, ?)
        """, (cp["id"], cp["name"], cp.get("targetSegment"), cp.get("status")))
        
    print("Importing email templates...")
    try:
        with open("src/data/mock/email_templates.json", "r", encoding="utf-8-sig") as f:
            email_templates = json.load(f)
            for t in email_templates:
                cursor.execute("""
                    INSERT OR IGNORE INTO email_templates (template_id, type, product, stage, subject, body, rating, use_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (t["template_id"], t.get("type"), t.get("product"), t.get("stage"), t.get("subject"), t.get("body"), t.get("rating"), t.get("use_count")))
    except FileNotFoundError:
        pass
        
    print("Importing call scripts...")
    try:
        with open("src/data/mock/call_scripts.json", "r", encoding="utf-8-sig") as f:
            call_scripts = json.load(f)
            for s in call_scripts:
                cursor.execute("""
                    INSERT OR IGNORE INTO call_scripts (script_id, objective, product, segment, stage, opening, main_content, objection_handling, closing, rating, use_count, tags)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (s["script_id"], s.get("objective"), s.get("product"), s.get("segment"), s.get("stage"), s.get("opening"), s.get("main_content"), json.dumps(s.get("objection_handling")), s.get("closing"), s.get("rating"), s.get("use_count"), json.dumps(s.get("tags"))))
    except FileNotFoundError:
        pass
        
    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == "__main__":
    main()
