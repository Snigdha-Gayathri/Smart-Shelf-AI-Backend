import json
import re

def parse_links(file_path):
    links = {}
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or not line.startswith('• '):
                continue
            
            # Format is generally `• Title: Author: Link`
            # Removing the bullet point
            content = line[2:].strip()
            
            # Splitting by colon. We expect at least 3 parts: Title, Author, url
            parts = content.split(':', 2)
            if len(parts) >= 3:
                title = parts[0].strip()
                author = parts[1].strip()
                
                # The url part might have colons (https://) so we re-join anything after the second colon
                url = content.split(':', 2)[2].strip()
                
                # Create a normalized key
                key = f"{title.lower()}||{author.lower()}"
                links[key] = url
    return links

def get_insights(book_type):
    # Default to fiction if book_type is missing or unexpected
    bt = str(book_type).lower() if book_type else "fiction"
    
    if "self help" in bt or "self-help" in bt:
        return {
            "vocabulary_enrichment": "Medium",
            "cognitive_benefit": "Mindset improvement and behavioral change",
            "skill_development": "Productivity, discipline, habit formation",
            "reading_value": "Practical life improvement"
        }
    elif "educational" in bt or "non-fiction" in bt or "nonfiction" in bt:
        return {
            "vocabulary_enrichment": "High",
            "cognitive_benefit": "Analytical thinking and conceptual understanding",
            "knowledge_domain": "Subject learning",
            "reading_value": "Academic knowledge growth"
        }
    else:  # fiction as default
        return {
            "vocabulary_enrichment": "Medium-High",
            "cognitive_benefit": "Emotional intelligence and narrative interpretation",
            "narrative_complexity": "Moderate-High",
            "reading_value": "Imagination, empathy, and character psychology"
        }

def update_dataset(json_path, links):
    with open(json_path, 'r', encoding='utf-8') as f:
        books = json.load(f)
    
    updated_count = 0
    
    for book in books:
        title = book.get('title', '').strip().lower()
        author = book.get('author', '').strip().lower()
        key = f"{title}||{author}"
        
        # Add buy_link if found
        if key in links:
            book['buy_link'] = links[key]
            updated_count += 1
            
        # Add reading_insights based on type 
        # (if type isn't present, default is fiction)
        btype = book.get('type', 'fiction')
        book['reading_insights'] = get_insights(btype)
        
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(books, f, indent=2, ensure_ascii=False)
        
    print(f"Dataset updated. Added {updated_count} buy links out of {len(books)} total books.")

if __name__ == "__main__":
    links_path = "book_links.txt"
    json_path = "books_data.json"
    
    parsed_links = parse_links(links_path)
    print(f"Parsed {len(parsed_links)} links from txt file.")
    update_dataset(json_path, parsed_links)
