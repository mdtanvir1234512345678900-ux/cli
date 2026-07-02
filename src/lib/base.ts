/* eslint-disable @typescript-eslint/no-explicit-any */

import {Command, Flags, Interfaces} from '@oclif/core'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import {ApiConfiguration} from '../api'
import {ResourceObject, Account, Address, Transfer, Balance} from '../output'

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<(typeof BaseCommand)['baseFlags'] & T['flags']>
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

export abstract class BaseCommand<T extends typeof Command> extends Command {
  static baseFlags = {
    raw: Flags.boolean({char: 'r', description: 'Output raw JSON (defaults to a table)', required: false}),
  }

  static enableJsonFlag = true

  protected args!: Args<T>
  protected flags!: Flags<T>

  // define flags that can be inherited by any command that extends BaseCommand
  protected async ensureSecureFile(filePath: string): Promise<void> {
    if (os.platform() !== 'win32') {
      try {
        const stats = await fs.stat(filePath)
        if ((stats.mode & 0o077) !== 0) {
          this.warn(`Warning: The configuration file at ${filePath} has insecure permissions. Please restrict access to your user only.`)
        }
      } catch (err) {
        this.warn(`Could not check file permissions on ${filePath}: ${err}`)
      }
    }
  }

  protected async catch(err: Error & {exitCode?: number}): Promise<any> {
    return super.catch(err)
  }

  protected configFilePath(): string {
    return path.join(this.config.configDir, 'config.json')
  }

  protected async exists(file: string) {
    try {
      await fs.stat(file)
      return true
    } catch {
      return false
    }
  }

  public async init(): Promise<void> {
    await super.init()
    const {args, flags} = await this.parse({
      args: this.ctor.args,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })
    this.flags = flags as Flags<T>
    this.args = args as Args<T>
  }

  protected async loadConfig(): Promise<ApiConfiguration> {
    const filePath = this.configFilePath()
    if (await this.exists(filePath)) {
      await this.ensureSecureFile(filePath)
      const file = await fs.readFile(filePath)
      return JSON.parse(file.toString('utf8')) as ApiConfiguration
    }

    throw new Error('API configuration has not been initialized. Please run the `brale configure` command.')
  }

  protected output<T extends ResourceObject | Account | Address | Transfer | Balance>(
    i: T | T[] | string[] | undefined,
    override: (_: T) => object = () => ({})
  ) {
    if (this.flags.raw) {
      this.log(JSON.stringify(i))
    } else if (Array.isArray(i)) {
      if (typeof i[0] === 'string') {
        console.table(i.map((item, index) => ({ index, accountId: item })))
      } else {
        this.table(i as T[], override)
      }
    } else if (i) {
      this.table([i] as T[], override)
    }
  }

  protected table<T extends ResourceObject | Account | Address | Transfer | Balance>(
    input: T[],
    override: (_: T) => object = () => ({})
  ) {
    const toRow = (i: T) => {
      if ('attributes' in i && 'id' in i) {
        const objectAttrs = Object.entries(i.attributes)
          .filter(([, v]) => typeof v === 'object')
          .map(([k, v]) => [k, JSON.stringify(v)])

        return {
          id: i.id,
          ...i.attributes,
          ...Object.fromEntries(objectAttrs),
          ...override(i),
        }
      }

      const flattened: any = {}
      Object.entries(i).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.entries(value).forEach(([nestedKey, nestedValue]) => {
            flattened[`${key}_${nestedKey}`] = nestedValue
          })
        } else if (Array.isArray(value)) {
          flattened[key] = value.join(', ')
        } else {
          flattened[key] = value
        }
      })

      return {
        ...flattened,
        ...override(i),
      }
    }

    const data = input.map((i) => toRow(i))
    console.table(data)
  }
  }
    
