const express = require('express');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const sanitizeHtml = require('sanitize-html');
const { marked } = require('marked');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const normalizeMarkdown = (markdown) => {
  const withoutTaskCheckboxes = markdown
    .replace(/^\s*[-*+] \[[ xX]\]\s+/gm, '- ')
    .replace(/^\s*\d+\. \[[ xX]\]\s+/gm, '1. ');

  const withoutCodeIndentation = withoutTaskCheckboxes.replace(/```[\s\S]*?```/g, (match) => {
    const lines = match.split('\n');
    if (lines.length < 3) return match;

    const openingFence = lines[0];
    const closingFence = lines[lines.length - 1];
    const codeLines = lines.slice(1, -1);

    const trimmed = codeLines
      .map((line) => line.replace(/^\s+/, ''))
      .join('\n');

    return `${openingFence}\n${trimmed}\n${closingFence}`;
  });

  return withoutCodeIndentation;
};

const sanitizeMarkdown = (markdown) => {
  const normalizedMarkdown = normalizeMarkdown(markdown);
  const rawHtml = marked.parse(normalizedMarkdown, {
    breaks: true,
    gfm: true,
    headerIds: false,
  });

  return sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'span', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 's', 'del'
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      '*': ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      })
    }
  });
};

const resolvePostPath = (slug) => {
  if (typeof slug !== 'string' || slug.trim().length === 0) {
    return null;
  }

  const normalizedSlug = slug.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedSlug) || normalizedSlug.includes('..')) {
    return null;
  }

  const postsDir = path.resolve(__dirname, 'posts');
  const filePath = path.resolve(postsDir, `${normalizedSlug}.md`);

  if (filePath !== postsDir && !filePath.startsWith(postsDir + path.sep)) {
    return null;
  }

  return filePath;
};

const getPosts = () => {
  const contentDir = path.join(__dirname, "posts");

  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir);
    return [];
  }

  const files = fs
    .readdirSync(contentDir)
    .filter((f) => path.extname(f).toLowerCase() === ".md");

  const posts = files
    .map((filename) => {
      const slug = path.basename(filename, ".md");
      const filePath = path.join(contentDir, filename);

      try {
        const markdown = fs.readFileSync(filePath, "utf8");
        const parsed = matter(markdown);

        if (!parsed.data || Object.keys(parsed.data).length === 0) {
          return null;
        }

        const metadata = parsed.data;
        const date = metadata.date ? new Date(metadata.date) : new Date(0);

        return {
          slug,
          filename,
          metadata: {
            ...metadata,
            date,
          },
        };
      } catch (err) {
        console.error("Failed to read post file:", filename, err);
        return null;
      }
    })
    .filter(Boolean); 

  posts.sort((a, b) => Number(new Date(b.metadata.date)) - Number(new Date(a.metadata.date)));
  return posts;
};


app.get('/', (req, res) => {
  try {
    const allPosts = getPosts();
    const recentPosts = allPosts.slice(0, 4);
    const hasMore = allPosts.length > 4;

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const recentWithUrls = recentPosts.map(p => ({
      ...p,
      url: `${baseUrl}/blog/${p.slug}`
    }));

    res.render('index', {
      title: 'index',
      url: baseUrl.replace(`${req.protocol}://`, ''),
      posts: recentWithUrls,
      hasMore
    });
  } catch (err) {
    console.error('Error rendering index.ejs', err);
    res.status(500).send('500: Internal Server Error');
  }
});

app.get('/blog', (req, res) => {
  try {
    const allPosts = getPosts();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const allWithUrls = allPosts.map(p => ({ ...p, url: `${baseUrl}/blog/${p.slug}` }));

    res.render('blogs', {
      title: 'blog',
      posts: allWithUrls
    });
  } catch (err) {
    console.error('Error rendering blogs.ejs', err);
    res.status(500).send('500: Internal Server Error');
  }
});

app.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;
  const filePath = resolvePostPath(slug);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).render('error', {
      title: '404 - Not Found',
      message: `The page you are looking for does not exist.`,
      url: req.originalUrl
    });
  }

  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const { data: metadata, content } = matter(markdown);

    const html = sanitizeMarkdown(content);

    res.render('post', {
      metadata,
      title: (metadata && metadata.title) ? metadata.title : slug,
      content: html
    });
  } catch (err) {
    console.error('Error rendering post.ejs', slug, err);
    res.status(500).send('500: Internal Server Error');
  }
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Not Found',
    message: 'The page you are looking for does not exist.',
    url: req.originalUrl
  });
});

module.exports = app;

// local node server start
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}