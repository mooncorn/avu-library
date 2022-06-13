import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import Queue from 'queue';
import { google } from 'googleapis';
import { IStorage } from './LocalStorage';
import { IGoogleAuth } from './GoogleAuth';
import { arrayContains } from './utilities';

export interface VideoMetadata {
  status: 'uploaded';
}

interface VideoUploaderOptions {
  storage: IStorage<VideoMetadata>;
  auth: IGoogleAuth;
  sourceDir: string;
  acceptedExtensions?: string[];
  uploadDelay?: number;
}

const defaults = {
  acceptedExtensions: ['.mov', '.mp4', '.avi'],
  uploadDelay: 3000,
};

export class VideoUploader {
  private queue: Queue;
  private storage: IStorage<VideoMetadata>;
  private auth: IGoogleAuth;
  private sourceDir: string;
  private acceptedExtensions: string[];
  private uploadDelay: number;

  constructor(opts: VideoUploaderOptions) {
    this.queue = new Queue({ autostart: true, concurrency: 1 });

    this.storage = opts.storage;
    this.auth = opts.auth;
    this.sourceDir = opts.sourceDir;
    this.acceptedExtensions = opts.acceptedExtensions || defaults.acceptedExtensions;
    this.uploadDelay = opts.uploadDelay || defaults.uploadDelay;
  }

  public authenticate = async () => {
    await this.auth.authenticate();
  };

  public listen = async (callback?: () => void) => {
    const token = await this.auth.getStoredToken();
    if (!token) throw new Error('Client is not authenticated');

    // Listen to add event in the source dir
    chokidar.watch(this.sourceDir).on('add', this.handleAddEvent);

    if (callback) callback();
  };

  /**
   * This function executes when a file is added to source directory.
   * @param filePath The filePath of added file.
   * @returns void
   */
  private handleAddEvent = async (filePath: string) => {
    const filename = path.basename(filePath);
    const fileExtension = path.extname(filename);
    const acceptedExtensions = this.acceptedExtensions;

    // Verify file extension
    if (!arrayContains(acceptedExtensions, fileExtension))
      throw new Error(`Error: File extension is invalid ${filename}`);

    // Verify if file has already been uploaded
    if (this.storage.get(filename)) throw new Error(`File has already been uploaded: ${filename}`);

    // Enqueue a job that will upload the video.
    // It is delayed so that the video has enough time to finish
    // writing itself to disk space. There has to be a better solution to this.
    setTimeout(() => {
      this.queue.push(async () => {
        const result = await this.uploadVideo(filePath);
        this.storage.add(filename, { status: 'uploaded' });
        return result;
      });
    }, this.uploadDelay);
  };

  private uploadVideo = async (filePath: string) => {
    const service = google.youtube('v3');
    const auth = this.auth.getClient();

    return await service.videos.insert({
      auth,
      part: ['snippet', 'status'],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: path.basename(filePath),
          defaultAudioLanguage: 'en',
          defaultLanguage: 'en',
        },
        status: {
          privacyStatus: 'unlisted',
        },
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });
  };
}
