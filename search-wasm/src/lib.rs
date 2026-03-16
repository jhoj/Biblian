use nucleo_matcher::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

// --- Bible JSON data model ---

#[derive(Deserialize)]
struct BibleData {
    books: Vec<Book>,
}

#[derive(Deserialize)]
struct Book {
    name: String,
    abbrev: String,
    chapters: Vec<Chapter>,
}

#[derive(Deserialize)]
struct Chapter {
    chapter: u32,
    verses: Vec<Verse>,
}

#[derive(Deserialize)]
struct Verse {
    verse: u32,
    text: String,
}

// --- Flat verse index ---

struct VerseEntry {
    book: String,
    abbrev: String,
    chapter: u32,
    verse: u32,
    text: String,
    ref_str: String,
}

// --- Search result returned to JS ---

#[derive(Serialize)]
struct SearchResult {
    book: String,
    abbrev: String,
    chapter: u32,
    verse: u32,
    text: String,
    #[serde(rename = "ref")]
    ref_str: String,
}

// --- Book entry for reference matching ---

struct BookEntry {
    /// Lowercase name for matching
    name_lower: String,
    /// Lowercase abbrev for matching
    abbrev_lower: String,
    /// Index of this book's first verse in the verses vec
    first_verse_idx: usize,
    /// Number of verses in this book
    verse_count: usize,
}

// --- Global state ---

struct Index {
    verses: Vec<VerseEntry>,
    books: Vec<BookEntry>,
    /// Inverted word index: lowercase word → sorted verse indices
    word_index: std::collections::BTreeMap<String, Vec<u32>>,
}

thread_local! {
    static INDEX: RefCell<Option<Index>> = RefCell::new(None);
}

// --- Query parsing ---

struct ParsedQuery {
    text_tokens: Vec<String>,
    chapter: Option<u32>,
    verse: Option<u32>,
}

fn parse_query(query: &str) -> ParsedQuery {
    let mut text_tokens = Vec::new();
    let mut numbers: Vec<u32> = Vec::new();

    for token in query.split_whitespace() {
        // Handle "3:16" colon syntax
        if let Some(pos) = token.find(':') {
            let left = &token[..pos];
            let right = &token[pos + 1..];
            if let (Ok(ch), Ok(vs)) = (left.parse::<u32>(), right.parse::<u32>()) {
                numbers.push(ch);
                numbers.push(vs);
                continue;
            }
        }

        if let Ok(n) = token.parse::<u32>() {
            numbers.push(n);
        } else {
            text_tokens.push(token.to_string());
        }
    }

    let chapter = numbers.first().copied();
    let verse = numbers.get(1).copied();

    ParsedQuery {
        text_tokens,
        chapter,
        verse,
    }
}

/// Match book names/abbrevs with nucleo, return vec of (book_index, score)
fn match_books(
    books: &[BookEntry],
    text_query: &str,
    matcher: &mut Matcher,
) -> Vec<(usize, u32)> {
    let pattern = Pattern::new(
        text_query,
        CaseMatching::Ignore,
        Normalization::Smart,
        AtomKind::Fuzzy,
    );

    let mut matched = Vec::new();

    for (bi, book) in books.iter().enumerate() {
        let mut buf = Vec::new();
        let haystack = Utf32Str::new(&book.name_lower, &mut buf);
        let name_score = pattern.score(haystack, matcher);

        let mut buf2 = Vec::new();
        let haystack2 = Utf32Str::new(&book.abbrev_lower, &mut buf2);
        let abbrev_score = pattern.score(haystack2, matcher);

        let best = match (name_score, abbrev_score) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };

        if let Some(score) = best {
            matched.push((bi, score));
        }
    }

    // Sort by score descending
    matched.sort_by(|a, b| b.1.cmp(&a.1));
    matched
}

// --- WASM exports ---

#[wasm_bindgen]
pub fn init(bible_msgpack: &[u8]) {
    let data: BibleData =
        rmp_serde::from_slice(bible_msgpack).expect("Failed to deserialize bible.bin");

    let mut verses = Vec::new();
    let mut books = Vec::new();

    for book in &data.books {
        let first_verse_idx = verses.len();
        let mut verse_count = 0;

        for chapter in &book.chapters {
            for v in &chapter.verses {
                let ref_str = format!("{} {}:{}", book.name, chapter.chapter, v.verse);
                verses.push(VerseEntry {
                    book: book.name.clone(),
                    abbrev: book.abbrev.clone(),
                    chapter: chapter.chapter,
                    verse: v.verse,
                    text: v.text.clone(),
                    ref_str,
                });
                verse_count += 1;
            }
        }

        books.push(BookEntry {
            name_lower: book.name.to_lowercase(),
            abbrev_lower: book.abbrev.to_lowercase(),
            first_verse_idx,
            verse_count,
        });
    }

    // Build inverted word index
    let mut word_index: std::collections::BTreeMap<String, Vec<u32>> =
        std::collections::BTreeMap::new();
    for (vi, verse) in verses.iter().enumerate() {
        let text_lower = verse.text.to_lowercase();
        for word in text_lower
            .split(|c: char| !c.is_alphabetic() && c != '\'')
            .filter(|w| !w.is_empty())
        {
            word_index
                .entry(word.to_string())
                .or_default()
                .push(vi as u32);
        }
    }

    INDEX.with(|idx| {
        *idx.borrow_mut() = Some(Index {
            verses,
            books,
            word_index,
        });
    });
}

#[wasm_bindgen]
pub fn search(query: &str, limit: usize) -> JsValue {
    let query = query.trim();
    if query.len() < 2 {
        return serde_wasm_bindgen::to_value(&Vec::<SearchResult>::new()).unwrap();
    }

    INDEX.with(|idx| {
        let borrow = idx.borrow();
        let index = borrow.as_ref().expect("Call init() first");

        let parsed = parse_query(query);
        let mut scored: Vec<(i64, usize)> = Vec::new();

        let mut matcher = Matcher::new(Config::DEFAULT);

        let has_text = !parsed.text_tokens.is_empty();
        let has_numbers = parsed.chapter.is_some();

        // Reference mode: text tokens match book names, numbers filter chapter/verse
        if has_text && has_numbers {
            let text_query = parsed.text_tokens.join(" ");
            let matched_books = match_books(&index.books, &text_query, &mut matcher);

            for (bi, book_score) in &matched_books {
                let book = &index.books[*bi];
                let start = book.first_verse_idx;
                let end = start + book.verse_count;

                for vi in start..end {
                    let verse = &index.verses[vi];

                    if let Some(ch) = parsed.chapter {
                        if verse.chapter != ch {
                            continue;
                        }
                    }

                    if let Some(vs) = parsed.verse {
                        if verse.verse != vs {
                            continue;
                        }
                    }

                    let mut score = (*book_score as i64) * 3;
                    if parsed.chapter.is_some() {
                        score += 100;
                    }
                    if parsed.verse.is_some() {
                        score += 50;
                    }
                    scored.push((score, vi));
                }
            }
        }

        // Text-only mode: inverted index prefix scan + intersection
        if has_text && !has_numbers {
            let query_lower = parsed.text_tokens.join(" ").to_lowercase();
            let query_words: Vec<&str> = query_lower.split_whitespace().collect();

            // For each query word, collect matching verse indices via prefix scan
            let mut candidate_sets: Vec<std::collections::HashSet<u32>> = query_words
                .iter()
                .map(|qw| {
                    let mut set = std::collections::HashSet::new();
                    for (key, postings) in index.word_index.range(qw.to_string()..) {
                        if !key.starts_with(*qw) {
                            break;
                        }
                        set.extend(postings);
                    }
                    set
                })
                .collect();

            // Intersect all candidate sets (smallest first for efficiency)
            candidate_sets.sort_by_key(|s| s.len());
            let candidates: std::collections::HashSet<u32> = candidate_sets
                .iter()
                .skip(1)
                .fold(
                    candidate_sets.first().cloned().unwrap_or_default(),
                    |acc, s| acc.intersection(s).copied().collect(),
                );

            // Score only candidates (much smaller set than all verses)
            for &vi in &candidates {
                let verse = &index.verses[vi as usize];
                let text_lower = verse.text.to_lowercase();
                let matches = query_words
                    .iter()
                    .filter(|w| text_lower.contains(*w))
                    .count();
                let phrase = if query_words.len() > 1 && text_lower.contains(&query_lower) {
                    500i64
                } else {
                    0
                };
                scored.push((matches as i64 * 1000 + phrase, vi as usize));
            }

            // Fuzzy fallback only if very few results
            if scored.len() < 5 {
                let text_query = parsed.text_tokens.join(" ");
                let pattern = Pattern::new(
                    &text_query,
                    CaseMatching::Ignore,
                    Normalization::Smart,
                    AtomKind::Fuzzy,
                );

                let seen: std::collections::HashSet<usize> =
                    scored.iter().map(|(_, vi)| *vi).collect();

                for (vi, verse) in index.verses.iter().enumerate() {
                    if seen.contains(&vi) {
                        continue;
                    }

                    let mut buf = Vec::new();
                    let haystack = Utf32Str::new(&verse.text, &mut buf);
                    if let Some(score) = pattern.score(haystack, &mut matcher) {
                        let capped = (score as i64).min(150);
                        scored.push((capped, vi));
                        if scored.len() >= limit * 3 {
                            break;
                        }
                    }
                }
            }
        }

        // Numbers only (no text): not very useful, but handle gracefully
        if !has_text && has_numbers {
            for (vi, verse) in index.verses.iter().enumerate() {
                if let Some(ch) = parsed.chapter {
                    if verse.chapter != ch {
                        continue;
                    }
                }
                if let Some(vs) = parsed.verse {
                    if verse.verse != vs {
                        continue;
                    }
                }
                scored.push((50, vi));
            }
        }

        // Sort by score descending
        scored.sort_by(|a, b| b.0.cmp(&a.0));

        // Deduplicate (verse index)
        let mut seen = std::collections::HashSet::new();
        scored.retain(|(_, vi)| seen.insert(*vi));

        // Take top results
        scored.truncate(limit);

        let results: Vec<SearchResult> = scored
            .iter()
            .map(|(_, vi)| {
                let v = &index.verses[*vi];
                SearchResult {
                    book: v.book.clone(),
                    abbrev: v.abbrev.clone(),
                    chapter: v.chapter,
                    verse: v.verse,
                    text: v.text.clone(),
                    ref_str: v.ref_str.clone(),
                }
            })
            .collect();

        serde_wasm_bindgen::to_value(&results).unwrap()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_query_text_only() {
        let q = parse_query("sælir eru");
        assert_eq!(q.text_tokens, vec!["sælir", "eru"]);
        assert_eq!(q.chapter, None);
        assert_eq!(q.verse, None);
    }

    #[test]
    fn test_parse_query_reference() {
        let q = parse_query("jo 3 16");
        assert_eq!(q.text_tokens, vec!["jo"]);
        assert_eq!(q.chapter, Some(3));
        assert_eq!(q.verse, Some(16));
    }

    #[test]
    fn test_parse_query_colon_syntax() {
        let q = parse_query("Matt 5:3");
        assert_eq!(q.text_tokens, vec!["Matt"]);
        assert_eq!(q.chapter, Some(5));
        assert_eq!(q.verse, Some(3));
    }

    #[test]
    fn test_parse_query_chapter_only() {
        let q = parse_query("1Mos 1");
        assert_eq!(q.text_tokens, vec!["1Mos"]);
        assert_eq!(q.chapter, Some(1));
        assert_eq!(q.verse, None);
    }
}
