import fs from 'fs';

export interface IStorage<T> {
  get(key: string): T;
  add(key: string, value: T): void;
}

interface LocalStorageOptions {
  filePath: string;
}

export class LocalStorage<T> implements IStorage<T> {
  private filePath: string;

  constructor(opts: LocalStorageOptions) {
    this.filePath = opts.filePath;
  }

  public add = (key: string, value: T) => {
    let data = this.read();

    data = {
      ...data,
      [key]: value,
    };

    this.write(data);
  };

  public delete = (key: string): void => {
    const data = this.read();

    delete data[key];

    this.write(data);
  };

  public get = (key: string): any | undefined => {
    const data = this.read();
    return data?.[key];
  };

  private write = (content: Record<string, T>): void => {
    fs.writeFileSync(this.filePath, JSON.stringify(content));
  };

  private read = (): Record<string, T> => {
    let dataString: string;

    try {
      dataString = fs.readFileSync(this.filePath).toString();
    } catch (e) {
      fs.writeFileSync(this.filePath, '{}');
      dataString = '{}';
    }

    return JSON.parse(dataString) as Record<string, T>;
  };
}
