import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import open from 'open';
import express, { Request, Response } from 'express';
import { google } from 'googleapis';
import { Credentials, OAuth2Client } from 'google-auth-library';

const OAuth2 = google.auth.OAuth2;

export interface IGoogleAuth {
  authenticate(): Promise<void>;
  getStoredToken(): Promise<Credentials | undefined>;
  getClient(): OAuth2Client;
}

export interface ClientSecret {
  installed: {
    client_id: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

export interface GoogleAuthOptions {
  clientSecretFilePath: string;
  tokenDir?: string;
  tokenFileName?: string;
  scopes?: string[];
  port?: number;
}

const defaults = {
  tokenDir: './.credentials',
  tokenFileName: 'google-token.json',
  scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  port: 3636,
};

export class GoogleAuth implements IGoogleAuth {
  private client: OAuth2Client;
  private tokenDir: string;
  private tokenFileName: string;
  private tokenFilePath: string;
  private scopes: string[];
  private port: number;
  private clientSecretFilePath: string;

  constructor(opts: GoogleAuthOptions) {
    this.client = new OAuth2();
    this.tokenDir = opts?.tokenDir || defaults.tokenDir;
    this.tokenFileName = opts?.tokenFileName || defaults.tokenFileName;
    this.scopes = opts?.scopes || defaults.scopes;
    this.port = opts?.port || defaults.port;
    this.clientSecretFilePath = opts.clientSecretFilePath;

    this.tokenFilePath = path.join(this.tokenDir, this.tokenFileName);
  }

  public getClientSecret = async (): Promise<ClientSecret> => {
    try {
      const credentialsBuffer = await fs.readFile(this.clientSecretFilePath);
      return JSON.parse(credentialsBuffer.toString());
    } catch (err) {
      throw new Error('Unable to access client secret file. Make sure the specified filepath is valid');
    }
  };

  public buildAuthorizeUrl = (): string => {
    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
    });
  };

  public buildToken = (code: string): Promise<Credentials> => {
    return new Promise((resolve, reject) => {
      this.client.getToken(code, async (err, token) => {
        if (err) return reject(err);

        resolve(token!);
      });
    });
  };

  public authorizeClient = (credentials: Credentials): void => {
    this.client.credentials = credentials;
  };

  public getStoredToken = async (): Promise<Credentials | undefined> => {
    try {
      const token = await fs.readFile(this.tokenFilePath);
      return JSON.parse(token.toString());
    } catch (err) {
      return;
    }
  };

  public buildAuthClient = (clientSecret: ClientSecret): void => {
    const secret = clientSecret.installed.client_secret;
    const clientId = clientSecret.installed.client_id;
    const redirectUrl = clientSecret.installed.redirect_uris[0];
    this.client = new OAuth2(clientId, secret, redirectUrl);
  };

  public storeToken = async (token: Credentials): Promise<void> => {
    try {
      await fs.mkdir(this.tokenDir, { recursive: true });
    } catch (err) {
      throw new Error('Unable to create a directory for the token');
    }

    try {
      await fs.writeFile(this.tokenFilePath, JSON.stringify(token));
    } catch (err) {
      throw new Error('Unable to write the token to a file');
    }
  };

  public receiveCode = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const app = express();
      let server: http.Server;

      app.use('/', async (req: Request, res: Response) => {
        try {
          const code = req.query.code as string;
          if (!code) throw new Error('Code not received');

          resolve(code);

          res.send('Authentication successful. You can close this tab now.');
        } catch (err) {
          reject(err);
        } finally {
          server.close();
        }
      });

      server = app.listen(this.port);
    });
  };

  public getClient = () => {
    return this.client;
  };

  public authenticate = async (): Promise<void> => {
    const clientSecret = await this.getClientSecret();
    this.buildAuthClient(clientSecret);

    // Check if already authenticated
    const storedToken = await this.getStoredToken();
    if (storedToken) return this.authorizeClient(storedToken);

    const url = this.buildAuthorizeUrl();
    open(url);

    const code = await this.receiveCode();
    const newToken = await this.buildToken(code);
    await this.storeToken(newToken);
    this.authorizeClient(newToken);
  };
}
