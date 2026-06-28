-- Books module schema

CREATE TABLE IF NOT EXISTS books_authors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(300) UNIQUE NOT NULL,
  bio TEXT,
  photo VARCHAR(500),
  birth_year INTEGER,
  nationality VARCHAR(100) DEFAULT 'Indian',
  website VARCHAR(500),
  wikipedia_url VARCHAR(500),
  woo_author_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS books_authors_slug_idx ON books_authors(slug);

CREATE TABLE IF NOT EXISTS books_publishers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(300) UNIQUE NOT NULL,
  description TEXT,
  logo VARCHAR(500),
  website VARCHAR(500),
  location VARCHAR(200),
  founded_year INTEGER,
  woo_publisher_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS books_publishers_slug_idx ON books_publishers(slug);

CREATE TABLE IF NOT EXISTS books_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  description TEXT,
  parent_id INTEGER REFERENCES books_categories(id),
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE NOT NULL,
  subtitle VARCHAR(500),
  description TEXT,
  cover_image VARCHAR(500),
  cover_image_alt VARCHAR(300),
  price DECIMAL(10,2),
  currency VARCHAR(10) DEFAULT 'INR',
  buy_url VARCHAR(500),
  isbn VARCHAR(50),
  isbn13 VARCHAR(50),
  pages INTEGER,
  language VARCHAR(50) DEFAULT 'English',
  published_year INTEGER,
  edition VARCHAR(100),
  format VARCHAR(50) DEFAULT 'paperback',
  tags TEXT[] DEFAULT '{}',
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  publisher_id INTEGER REFERENCES books_publishers(id),
  woo_product_id INTEGER UNIQUE,
  woo_synced_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS books_slug_idx ON books(slug);
CREATE INDEX IF NOT EXISTS books_publisher_idx ON books(publisher_id);
CREATE INDEX IF NOT EXISTS books_status_idx ON books(status);
CREATE INDEX IF NOT EXISTS books_featured_idx ON books(is_featured);
CREATE INDEX IF NOT EXISTS books_tags_idx ON books USING GIN(tags);

CREATE TABLE IF NOT EXISTS books_book_authors (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES books_authors(id),
  role VARCHAR(100) DEFAULT 'author',
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (book_id, author_id)
);

CREATE TABLE IF NOT EXISTS books_book_categories (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES books_categories(id),
  PRIMARY KEY (book_id, category_id)
);

CREATE TABLE IF NOT EXISTS books_reviews (
  id SERIAL PRIMARY KEY,
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  reviewer_name VARCHAR(200),
  reviewer_email VARCHAR(300),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS books_reviews_book_idx ON books_reviews(book_id);
CREATE INDEX IF NOT EXISTS books_reviews_status_idx ON books_reviews(status);

INSERT INTO books_categories (name, slug, sort_order) VALUES
  ('Fiction', 'fiction', 1),
  ('Non-Fiction', 'non-fiction', 2),
  ('History', 'history', 3),
  ('Culture', 'culture', 4),
  ('Politics', 'politics', 5),
  ('Literature', 'literature', 6),
  ('Biography', 'biography', 7),
  ('Children', 'children', 8),
  ('Academic', 'academic', 9),
  ('Poetry', 'poetry', 10),
  ('Assamese Literature', 'assamese-literature', 11),
  ('Northeast India', 'northeast-india', 12),
  ('Arts & Literature', 'arts-literature', 13),
  ('Historical Fiction', 'historical-fiction', 14),
  ('Romance', 'romance', 15),
  ('Self-Help', 'self-help', 16)
ON CONFLICT (slug) DO NOTHING;
