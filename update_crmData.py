import re
import sys
import random

def main():
    file_path = "src/services/crmData.js"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find each customer object and add rmId. We'll alternate RM001, RM002
    def replacer(match):
        location = match.group(1)
        rm_id = "RM00" + str(random.randint(1, 2))
        return f'{location},\n    rmId: "{rm_id}"'

    new_content = re.sub(r'(location: "[^"]+")', replacer, content)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)

if __name__ == "__main__":
    main()
