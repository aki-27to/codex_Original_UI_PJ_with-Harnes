"use strict";

const fs=require("fs");
const path=require("path");

function safeString(value,max=12000){
  if(typeof value!=="string")return"";
  const trimmed=value.trim();
  if(!trimmed)return"";
  return trimmed.slice(0,max);
}

function normalizeOptionalString(value,max=2000){
  const normalized=safeString(value,max);
  return normalized||null;
}

function getMimeType(filePath){
  const ext=path.extname(filePath).toLowerCase();
  if(ext===".html")return"text/html; charset=utf-8";
  if(ext===".js")return"application/javascript; charset=utf-8";
  if(ext===".css")return"text/css; charset=utf-8";
  if(ext===".json")return"application/json; charset=utf-8";
  if(ext===".svg")return"image/svg+xml";
  if(ext===".png")return"image/png";
  if(ext===".jpg"||ext===".jpeg")return"image/jpeg";
  if(ext===".ico")return"image/x-icon";
  return"application/octet-stream";
}

function resolveExistingStaticDirectory(value,{baseDir,indexFile="index.html"}={}){
  const raw=safeString(value,2000);
  if(!raw)return null;
  const resolved=path.resolve(baseDir||process.cwd(),raw);
  try{
    const stat=fs.statSync(resolved);
    if(!stat.isDirectory())return null;
    if(!indexFile)return resolved;
    const indexStat=fs.statSync(path.join(resolved,indexFile));
    return indexStat.isFile()?resolved:null;
  }catch{
    return null;
  }
}

function normalizeStaticRequestRelativePath(rawPath){
  const decoded=String(rawPath||"").replace(/^\/+/,"");
  if(!decoded)return"index.html";
  if(/[\\/]$/.test(decoded))return path.join(decoded,"index.html");
  return decoded;
}

function safeDecodeURIComponent(value){
  try{
    return{ok:true,value:decodeURIComponent(String(value||""))};
  }catch{
    return{ok:false,value:""};
  }
}

function resolveEnglishConversationOverrideSource(rawOverride,resolvedRoot,workspaceRoot){
  if(!rawOverride||!resolvedRoot)return"";
  const candidates=[
    {root:rawOverride,baseDir:workspaceRoot,source:"env-override-root"},
    {root:path.join(rawOverride,"dist"),baseDir:workspaceRoot,source:"env-override-dist"},
    {root:path.join(rawOverride,"web","english-conversation-app"),baseDir:workspaceRoot,source:"env-override-web"},
  ];
  for(const candidate of candidates){
    const candidateRoot=resolveExistingStaticDirectory(candidate.root,{baseDir:candidate.baseDir||workspaceRoot,indexFile:"index.html"});
    if(candidateRoot&&path.resolve(candidateRoot)===path.resolve(resolvedRoot)){
      return candidate.source;
    }
  }
  return"";
}

function createAppPlatformReadSurface(options={}){
  const {
    appRegistry=[],
    buildAppRegistryRuntimeSnapshot,
    buildHarnessAppRuntimeStatus,
    bundledEnglishConversationAppRoot,
    defaultIntegratedEnglishConversationAppRoot,
    findAppById,
    findAppByMountPath,
    getRegisteredAppRuntimeConfig,
    isPathWithin,
    legacyExternalEnglishConversationAppRoot,
    resolveNativeStaticRoot,
    sendJson,
    summarizePathForOperationLog,
    webRoot,
    workspaceRoot,
  }=options;

  function getEnglishConversationAppStaticSource(){
    const manifest=findAppById(appRegistry,"english-conversation-app");
    const envKey=manifest&&manifest.static&&manifest.static.envKey
      ?manifest.static.envKey
      :"CODEX_ENGLISH_CONVERSATION_APP_ROOT";
    const rawOverride=normalizeOptionalString(process.env[envKey],2000);
    if(manifest){
      const resolvedFromManifest=resolveNativeStaticRoot(manifest,workspaceRoot);
      if(resolvedFromManifest&&resolvedFromManifest.root){
        const overrideSource=resolveEnglishConversationOverrideSource(rawOverride,resolvedFromManifest.root,workspaceRoot);
        return{
          root:resolvedFromManifest.root,
          source:overrideSource||resolvedFromManifest.source||"configured",
          envKey,
          defaultAppRoot:defaultIntegratedEnglishConversationAppRoot,
          defaultSiblingRoot:legacyExternalEnglishConversationAppRoot,
          legacySiblingRoot:legacyExternalEnglishConversationAppRoot,
          bundledRoot:bundledEnglishConversationAppRoot,
          mountPath:manifest.mountPath||"/apps/english-conversation-app",
          legacyMountPath:manifest.legacyMountPath||"/english-conversation-app",
        };
      }
    }
    const overrideCandidates=rawOverride
      ?[
        {root:rawOverride,baseDir:workspaceRoot,source:"env-override-root"},
        {root:path.join(rawOverride,"dist"),baseDir:workspaceRoot,source:"env-override-dist"},
        {root:path.join(rawOverride,"web","english-conversation-app"),baseDir:workspaceRoot,source:"env-override-web"},
      ]
      :[];
    const integratedCandidates=[
      {root:defaultIntegratedEnglishConversationAppRoot,source:"workspace-app-root"},
      {root:path.join(defaultIntegratedEnglishConversationAppRoot,"dist"),source:"workspace-app-dist"},
      {root:path.join(defaultIntegratedEnglishConversationAppRoot,"web","english-conversation-app"),source:"workspace-app-web"},
    ];
    const siblingCandidates=[
      {root:legacyExternalEnglishConversationAppRoot,source:"external-sibling-root"},
      {root:path.join(legacyExternalEnglishConversationAppRoot,"dist"),source:"external-sibling-dist"},
      {root:path.join(legacyExternalEnglishConversationAppRoot,"web","english-conversation-app"),source:"external-sibling-web"},
    ];
    for(const candidate of [...overrideCandidates,...integratedCandidates,...siblingCandidates]){
      const root=resolveExistingStaticDirectory(candidate.root,{baseDir:candidate.baseDir||workspaceRoot,indexFile:"index.html"});
      if(root){
        return{
          root,
          source:candidate.source,
          envKey,
          defaultAppRoot:defaultIntegratedEnglishConversationAppRoot,
          defaultSiblingRoot:legacyExternalEnglishConversationAppRoot,
          legacySiblingRoot:legacyExternalEnglishConversationAppRoot,
          bundledRoot:bundledEnglishConversationAppRoot,
          mountPath:manifest&&manifest.mountPath?manifest.mountPath:"/apps/english-conversation-app",
          legacyMountPath:manifest&&manifest.legacyMountPath?manifest.legacyMountPath:"/english-conversation-app",
        };
      }
    }
    return{
      root:bundledEnglishConversationAppRoot,
      source:"workspace-bundled",
      envKey,
      defaultAppRoot:defaultIntegratedEnglishConversationAppRoot,
      defaultSiblingRoot:legacyExternalEnglishConversationAppRoot,
      legacySiblingRoot:legacyExternalEnglishConversationAppRoot,
      bundledRoot:bundledEnglishConversationAppRoot,
      mountPath:manifest&&manifest.mountPath?manifest.mountPath:"/apps/english-conversation-app",
      legacyMountPath:manifest&&manifest.legacyMountPath?manifest.legacyMountPath:"/english-conversation-app",
    };
  }

  function buildStaticAppsRuntimeSnapshot(){
    const englishConversationApp=getEnglishConversationAppStaticSource();
    return{
      englishConversationApp:{
        mountPath:"/english-conversation-app",
        root:summarizePathForOperationLog(englishConversationApp.root,220),
        source:englishConversationApp.source,
        envKey:englishConversationApp.envKey,
        defaultAppRoot:summarizePathForOperationLog(englishConversationApp.defaultAppRoot,220),
        defaultSiblingRoot:summarizePathForOperationLog(englishConversationApp.defaultSiblingRoot,220),
        legacySiblingRoot:summarizePathForOperationLog(englishConversationApp.legacySiblingRoot,220),
        bundledRoot:summarizePathForOperationLog(englishConversationApp.bundledRoot,220),
      },
      apps:buildAppRegistryRuntimeSnapshot(appRegistry,workspaceRoot).map((app)=>({
        ...app,
        manifestPath:summarizePathForOperationLog(app.manifestPath,220),
        workingDirectory:summarizePathForOperationLog(app.workingDirectory,220),
        proxy:app.proxy&&typeof app.proxy==="object"
          ?{
            ...app.proxy,
          }
          :undefined,
        static:app.static&&typeof app.static==="object"
          ?{
            ...app.static,
            root:summarizePathForOperationLog(app.static.root,220),
          }
          :undefined,
      })),
    };
  }

  function getRegisteredNativeStaticAppSource(app){
    if(!app||app.integrationMode!=="native-static")return null;
    const resolved=resolveNativeStaticRoot(app,workspaceRoot);
    if(!resolved||!resolved.root)return null;
    return{
      root:resolved.root,
      source:resolved.source||"configured",
      mountPath:app.mountPath,
    };
  }

  function buildStaticRequestTarget(pathname){
    const decodedPath=safeDecodeURIComponent(pathname||"/");
    if(!decodedPath.ok){
      return{
        root:webRoot,
        absolutePath:webRoot,
        allowed:false,
        statusCode:400,
        error:"Bad percent encoding",
        code:"BAD_PERCENT_ENCODING",
      };
    }
    const decoded=decodedPath.value;
    if(decoded==="/"||decoded===""){
      const relativePath="index.html";
      const absolutePath=path.resolve(webRoot,relativePath);
      return{root:webRoot,absolutePath,allowed:isPathWithin(webRoot,absolutePath)};
    }
    const englishSource=getEnglishConversationAppStaticSource();
    const englishMountPath=englishSource&&englishSource.mountPath?englishSource.mountPath:"/apps/english-conversation-app";
    const englishLegacyMountPath=englishSource&&englishSource.legacyMountPath?englishSource.legacyMountPath:"/english-conversation-app";
    const englishMountMatched=
      decoded===englishMountPath||
      decoded.startsWith(`${englishMountPath}/`)||
      decoded===englishLegacyMountPath||
      decoded.startsWith(`${englishLegacyMountPath}/`);
    if(englishMountMatched){
      const matchedPrefix=decoded===englishMountPath||decoded.startsWith(`${englishMountPath}/`)
        ?englishMountPath
        :englishLegacyMountPath;
      const relativePath=decoded===matchedPrefix
        ?"index.html"
        :normalizeStaticRequestRelativePath(decoded.slice(`${matchedPrefix}/`.length));
      const absolutePath=path.resolve(englishSource.root,relativePath);
      return{
        root:englishSource.root,
        absolutePath,
        allowed:isPathWithin(englishSource.root,absolutePath),
        source:englishSource.source,
      };
    }
    const registeredApp=findAppByMountPath?findAppByMountPath(appRegistry,decoded):null;
    const registeredSource=getRegisteredNativeStaticAppSource(registeredApp);
    if(registeredApp&&registeredSource&&registeredApp.mountPath){
      const matchedPrefix=registeredApp.mountPath;
      const relativePath=decoded===matchedPrefix
        ?"index.html"
        :normalizeStaticRequestRelativePath(decoded.slice(`${matchedPrefix}/`.length));
      const absolutePath=path.resolve(registeredSource.root,relativePath);
      return{
        root:registeredSource.root,
        absolutePath,
        allowed:isPathWithin(registeredSource.root,absolutePath),
        source:registeredSource.source,
      };
    }
    const relativePath=normalizeStaticRequestRelativePath(decoded);
    const absolutePath=path.resolve(webRoot,relativePath);
    return{root:webRoot,absolutePath,allowed:isPathWithin(webRoot,absolutePath)};
  }

  function serveStaticFile(req,res,pathname){
    const target=buildStaticRequestTarget(pathname);
    if(target&&target.statusCode){
      sendJson(res,target.statusCode,{error:target.error||"Invalid path",code:target.code||"INVALID_PATH"});
      return;
    }
    if(!target||!target.allowed){
      sendJson(res,403,{error:"Forbidden"});
      return;
    }
    try{
      const stat=fs.statSync(target.absolutePath);
      if(stat.isDirectory()){
        target.absolutePath=path.resolve(target.absolutePath,"index.html");
      }
    }catch{
    }
    if(!isPathWithin(target.root,target.absolutePath)){
      sendJson(res,403,{error:"Forbidden"});
      return;
    }
    fs.readFile(target.absolutePath,(err,data)=>{
      if(err){
        sendJson(res,404,{error:"Not found"});
        return;
      }
      res.writeHead(200,{
        "Content-Type":getMimeType(target.absolutePath),
        "Content-Length":data.length,
        "Cache-Control":"no-store",
      });
      res.end(data);
    });
  }

  async function handleHarnessAppsCatalogRequest(res){
    sendJson(res,200,{
      ok:true,
      apps:buildAppRegistryRuntimeSnapshot(appRegistry,workspaceRoot),
    });
  }

  async function handleHarnessAppRuntimeRequest(res,appId){
    const app=getRegisteredAppRuntimeConfig(appId);
    if(!app){
      sendJson(res,404,{ok:false,error:"unknown app"});
      return;
    }
    sendJson(res,200,{
      ok:true,
      app:{
        id:app.id,
        title:app.title,
        mountPath:app.mountPath,
        integrationMode:app.integrationMode,
      },
      ai:await buildHarnessAppRuntimeStatus(app),
    });
  }

  async function tryHandleGetRequest({req,res,pathname,buildRuntimeApiSnapshot}={}){
    if(!req||req.method!=="GET")return false;
    if(pathname==="/api/runtime"){
      sendJson(res,200,buildRuntimeApiSnapshot());
      return true;
    }
    if(pathname==="/api/apps"){
      await handleHarnessAppsCatalogRequest(res);
      return true;
    }
    if(pathname.startsWith("/api/apps/")){
      const appRuntimeMatch=pathname.match(/^\/api\/apps\/([^/]+)\/runtime$/);
      if(appRuntimeMatch){
        const decodedAppId=safeDecodeURIComponent(appRuntimeMatch[1]);
        if(!decodedAppId.ok){
          sendJson(res,400,{ok:false,error:"Invalid app id.",code:"BAD_PERCENT_ENCODING"});
          return true;
        }
        await handleHarnessAppRuntimeRequest(res,decodedAppId.value);
        return true;
      }
    }
    return false;
  }

  return{
    buildStaticAppsRuntimeSnapshot,
    buildStaticRequestTarget,
    getEnglishConversationAppStaticSource,
    serveStaticFile,
    tryHandleGetRequest,
  };
}

module.exports={
  createAppPlatformReadSurface,
  safeDecodeURIComponent,
};
