const express = require('express');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const getPosts = () => {
  const contentDir = path.join(__dirname, 'posts');

  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir);
    return [];
  }

  const files = fs.readdirSync(contentDir)
    .filter(f => path.extname(f).toLowerCase() === '.md');

  const posts = files.map(filename => {
    const slug = path.basename(filename, '.md');
    const filePath = path.join(contentDir, filename);
    try {
      const markdown = fs.readFileSync(filePath, 'utf8');
      const { data: metadata } = matter(markdown);

      const date = metadata && metadata.date ? new Date(metadata.date) : new Date(0);

      return {
        slug,
        filename,
        metadata: {
          ...(metadata || {}),
          date
        }
      };
    } catch (err) {
      console.error('Failed to read post file:', filename, err);
      return null;
    }
  }).filter(Boolean);

  posts.sort((a, b) => +b.metadata.date - +a.metadata.date);
  return posts;
}

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
    console.error('Error rendering index', err);
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
    console.error('Error rendering blogs', err);
    res.status(500).send('500: Internal Server Error');
  }
});

app.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;
  const filePath = path.join(__dirname, 'posts', `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).render('error', {
      title: '404 - Not Found',
      message: `The page you are looking for does not exist.`,
      url: req.originalUrl
    });
  }

  try {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const { data: metadata, content } = matter(markdown);
    
    const { marked } = await import('marked');

    const html = marked.parse(content);

    res.render('post', {
      metadata,
      title: (metadata && metadata.title) ? metadata.title : slug,
      content: html
    });
  } catch (err) {
    console.error('Error rendering post', slug, err);
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

