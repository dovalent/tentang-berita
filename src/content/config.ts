import { defineCollection, z } from 'astro:content';

const newsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    permalink: z.string(),
    date: z.string(),
    author: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    image_url: z.string(),
    image_caption: z.string().optional(),
    excerpt: z.string(),
  }),
});

export const collections = {
  news: newsCollection,
};
