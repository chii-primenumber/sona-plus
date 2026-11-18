import { RecommendationSettings } from '@/components/ui/RecommendationControls'
import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'
import { SonaCheckbox } from '@/components/ui/SonaCheckbox'
import { applyImportedSonaConfig, serializeSonaConfig } from '@/lib/config-transfer'
import { normalizeCorsProxyBaseUrl } from '@/lib/cors-proxy'
import { store } from '@/lib/store'
import { checkForUpdates, clearSkippedUpdateVersion } from '@/lib/update-checker'
import { useI18n, type SonaLocaleSetting } from '@/i18n'
import '@/styles/SettingsPage.css'

const hotkeyOptions = [
  { value: 'F1', label: 'F1' },
  { value: 'F2', label: 'F2' },
  { value: 'F3', label: 'F3' },
  { value: 'F4', label: 'F4' },
  { value: 'F5', label: 'F5' },
]

export function SettingsPage() {
  const { localeSetting, setLocaleSetting, t } = useI18n()
  const [automaticUpdates,setAutomaticUpdates]=useState(store.get('automaticUpdateCheck'))
  const [developerMode, setDeveloperMode] = useState(store.get('developerMode'))
  const [hotkey, setHotkey] = useState(store.get('hotkey'))
  const [hideSonaIcon, setHideSonaIcon] = useState(store.get('hideSonaIcon'))
  const [globalParticle, setGlobalParticle] = useState(store.get('globalParticle'))
  const [dynamicEffects, setDynamicEffects] = useState(store.get('dynamicEffects'))
  const [skippedUpdateVersion, setSkippedUpdateVersion] = useState(store.get('skippedUpdateVersion'))
  const [proxyInput, setProxyInput] = useState(store.get('customCorsProxyUrl'))
  const [proxyStatus, setProxyStatus] = useState('')
  const [includeAccountData, setIncludeAccountData] = useState(true)
  const [transferStatus, setTransferStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const localeOptions = [
    { value: 'auto', label: t('settings.language.auto') },
    { value: 'zh-CN', label: t('settings.language.zhCN') },
    { value: 'en-US', label: t('settings.language.enUS') },
  ]

  useEffect(() => {
    const unsubs = [
      store.onChange('automaticUpdateCheck',setAutomaticUpdates),
      store.onChange('developerMode', setDeveloperMode),
      store.onChange('hotkey', setHotkey),
      store.onChange('hideSonaIcon', setHideSonaIcon),
      store.onChange('globalParticle', setGlobalParticle),
      store.onChange('dynamicEffects', setDynamicEffects),
      store.onChange('skippedUpdateVersion', setSkippedUpdateVersion),
      store.onChange('customCorsProxyUrl', setProxyInput),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const handleExportConfig = () => {
    try {
      const content = serializeSonaConfig({ includeAccountData })
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      anchor.href = url
      anchor.download = `sona-plus-config-${stamp}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setTransferStatus('配置已导出为 JSON 文件。')
    } catch (err) {
      setTransferStatus(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const { appliedKeys, skippedKeys } = applyImportedSonaConfig(text)
      setTransferStatus(`已成功导入并应用 ${appliedKeys} 项配置${skippedKeys > 0 ? `（跳过 ${skippedKeys} 项不兼容字段）` : ''}。`)
    } catch (err) {
      setTransferStatus(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSaveProxy = () => {
    const trimmed = proxyInput.trim()
    if (!trimmed) {
      store.set('customCorsProxyUrl', '')
      setProxyStatus('已恢复使用默认兜底代理。')
      return
    }
    const normalized = normalizeCorsProxyBaseUrl(trimmed)
    if (!normalized) {
      setProxyStatus('代理地址无效，请填写完整的 https:// 地址（如 Cloudflare Worker 地址）。')
      return
    }
    store.set('customCorsProxyUrl', normalized)
    setProxyInput(normalized)
    setProxyStatus('已保存自定义跨域代理地址。')
  }

  return (
    <div className="sona-settings">
      <h2 className="sona-settings-title">{t('settings.title')}</h2>

      <SettingGroup title={t('settings.group.general')}>
        <SettingCard
          title={t('settings.language.title')}
          description={t('settings.language.description')}
        >
          <SonaSelect
            options={localeOptions}
            value={localeSetting}
            onChange={(v) => setLocaleSetting(v as SonaLocaleSetting)}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hotkey.title')}
          description={t('settings.hotkey.description')}
        >
          <SonaSelect
            options={hotkeyOptions}
            value={hotkey}
            onChange={(v) => { setHotkey(v); store.set('hotkey', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.hideSonaIcon.title')}
          description={t('settings.hideSonaIcon.description', { hotkey })}
        >
          <SonaSwitch
            checked={hideSonaIcon}
            onChange={(v) => { setHideSonaIcon(v); store.set('hideSonaIcon', v) }}
          />
        </SettingCard>
        <SettingCard title={t('settings.dynamicEffects.title')} description={t('settings.dynamicEffects.description')}>
          <SonaSwitch checked={dynamicEffects} onChange={(value) => store.set('dynamicEffects', value)} />
        </SettingCard>
        <SettingCard
          title={t('settings.globalParticle.title')}
          description={t('settings.globalParticle.description')}
        >
          <SonaSwitch
            checked={globalParticle}
            onChange={(v) => { setGlobalParticle(v); store.set('globalParticle', v) }}
          />
        </SettingCard>
        <SettingCard title="自动检查更新" description="启动后及重新打开面板时按需检查，成功检查间隔六小时。"><SonaSwitch checked={automaticUpdates} onChange={value=>store.set('automaticUpdateCheck',value)}/></SettingCard>
        {skippedUpdateVersion && (
          <SettingCard
            title={t('settings.skippedUpdate.title', { version: skippedUpdateVersion })}
            description={t('settings.skippedUpdate.description')}
          >
            <SonaButton onClick={() => {
              clearSkippedUpdateVersion()
              void checkForUpdates()
            }}>
              {t('settings.skippedUpdate.clear')}
            </SonaButton>
          </SettingCard>
        )}
      </SettingGroup>


      <RecommendationSettings />
      <SettingGroup title="配置备份与迁移">
        <SettingCard
          title="导出 / 导入 Sona Plus 配置"
          description="将所有功能开关、显示字段、英雄符文记忆、玩家小本本与美化参数导出为 JSON 文件，或在新环境中一键导入恢复。"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <SonaCheckbox
              checked={includeAccountData}
              onChange={setIncludeAccountData}
              label="包含账号记录（键位备份、最近访问与自定义签名）"
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SonaButton onClick={handleExportConfig}>导出配置 JSON</SonaButton>
              <SonaButton variant="primary" onClick={() => fileInputRef.current?.click()}>导入配置 JSON</SonaButton>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                aria-label="选择配置文件导入"
                style={{ display: 'none' }}
                onChange={(e) => { void handleImportFile(e) }}
              />
            </div>
            {transferStatus && <span className="sona-subtitle" role="status" style={{ margin: 0 }}>{transferStatus}</span>}
          </div>
        </SettingCard>
      </SettingGroup>

      <SettingGroup title={t('settings.group.advanced')}>
        <SettingCard
          title="自定义跨域代理地址"
          description="可选填入自建 Cloudflare Worker 转发地址（见源码 scripts/cloudflare-cors-worker.js），留空则使用默认兜底代理。"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 280 }}>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <div style={{ flex: 1 }}>
                <SonaInput
                  value={proxyInput}
                  onChange={(v) => { setProxyInput(v); setProxyStatus('') }}
                  placeholder="https://your-worker.workers.dev/"
                />
              </div>
              <SonaButton onClick={handleSaveProxy}>保存代理</SonaButton>
            </div>
            {proxyStatus && <span className="sona-subtitle" role="status" style={{ margin: 0 }}>{proxyStatus}</span>}
          </div>
        </SettingCard>
        <SettingCard
          title={t('settings.developerMode.title')}
          description={t('settings.developerMode.description')}
        >
          <SonaSwitch
            checked={developerMode}
            onChange={(v) => { setDeveloperMode(v); store.set('developerMode', v) }}
          />
        </SettingCard>
      </SettingGroup>
    </div>
  )
}
