import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import cors from 'cors'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

app.use(
  cors({
    origin: process.env.DOMAIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  }),
)

const s3Client = new S3Client({
  region: 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_PK,
    secretAccessKey: process.env.AWS_SK,
  },
})

app.post('/api/v1/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files
    const formats = Array.isArray(req.body.formats)
      ? req.body.formats
      : [req.body.formats]
    const widths = Array.isArray(req.body.widths)
      ? req.body.widths
      : [req.body.widths]
    const heights = Array.isArray(req.body.heights)
      ? req.body.heights
      : [req.body.heights]
    const fits = Array.isArray(req.body.fits) ? req.body.fits : [req.body.fits]
    const strips = Array.isArray(req.body.strips)
      ? req.body.strips
      : [req.body.strips]

    const bucketUrl = process.env.BUCKET_URL
    const bucket = process.env.BUCKET_NAME

    const convertedImageData = await Promise.all(
      files.map(async (file, index) => {
        const format = formats[index]
        const width = widths[index]
        const height = heights[index]
        const fit = fits[index]
        const strip = strips[index]
        const fileName = file.originalname.split('.')[0]
        const imageName = fileName + '.' + format

        const convertedImageBuffer = await sharp(file.buffer)
          .resize(
            width === '' ? null : parseInt(width),
            height === '' ? null : parseInt(height),
            { fit },
          )
          .toFormat(format)
          .withMetadata(strip === 'yes' ? {} : undefined)
          .toBuffer()

        const convertedImageSizeInKB = convertedImageBuffer.length / 1024

        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: imageName,
              ACL: 'public-read',
              ContentType: file.type,
              Body: convertedImageBuffer,
            }),
          )
          console.log(`Image uploaded to S3: ${imageName}`)
        } catch (error) {
          console.error(`Error uploading to S3: ${error.message}`)
          throw error
        }

        return {
          name: file.originalname,
          imageUrl: `${bucketUrl}/${imageName}`,
          newName: imageName,
          newFormat: format,
          newSize: convertedImageSizeInKB,
        }
      }),
    )

    res.json({ convertedImageData })
  } catch (error) {
    console.error(`Error converting image: ${error.message}`)
    res.status(500).json({ message: 'Error converting image' })
  }
})

app.listen(process.env.PORT || 3000, () =>
  console.log('Server listening on port 3000'),
)
