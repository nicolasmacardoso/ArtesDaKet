import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  adminEmail,
  FRAME_COUNT,
  FRAMES_BUCKET,
  FrameRecord,
  isSupabaseConfigured,
  supabase,
} from './supabase';

type Frame = FrameRecord & {
  publicUrl: string | null;
};

type ViewerImage = {
  src: string;
  frameId: number;
};

const frameIds = Array.from({ length: FRAME_COUNT }, (_, index) => index + 1);

function App() {
  const [frames, setFrames] = useState<Frame[]>(() => createEmptyFrames());
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [viewerImage, setViewerImage] = useState<ViewerImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [uploadingFrameId, setUploadingFrameId] = useState<number | null>(null);
  const [removingFrameId, setRemovingFrameId] = useState<number | null>(null);
  const [savingTitleFrameId, setSavingTitleFrameId] = useState<number | null>(null);
  const [titleDrafts, setTitleDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  const loggedUserEmail = session?.user.email?.toLowerCase() ?? '';
  const isAdmin = Boolean(session && adminEmail && loggedUserEmail === adminEmail);
  const filledFramesCount = frames.filter((frame) => frame.image_path).length;

  const rows = useMemo(() => {
    return [frames.slice(0, 6), frames.slice(6, 12)];
  }, [frames]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setMessage('Configure as variáveis do Supabase para carregar a galeria.');
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    loadFrames().finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!viewerImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewerImage(null);
      }
    };

    document.body.classList.add('modal-open');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewerImage]);

  async function loadFrames() {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from('frames')
      .select('id, title, image_path, updated_at')
      .order('id', { ascending: true });

    if (error) {
      setMessage('Não foi possível carregar as artes agora.');
      return;
    }

    const nextFrames = mergeFrames(data ?? []);

    setFrames(nextFrames);
    setTitleDrafts(createTitleDrafts(nextFrames));
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage('Configure o Supabase antes de fazer login.');
      return;
    }

    setAuthLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage('E-mail ou senha inválidos.');
    } else {
      setEmail('');
      setPassword('');
      setMessage(null);
    }

    setAuthLoading(false);
  }

  async function handleLogout() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
  }

  function handleTitleDraftChange(frameId: number, title: string) {
    setTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [frameId]: title,
    }));
  }

  async function handleSaveTitle(frame: Frame) {
    if (!supabase || !isAdmin) {
      return;
    }

    const title = titleDrafts[frame.id]?.trim() ?? '';

    setSavingTitleFrameId(frame.id);
    setMessage(null);

    const { error } = await supabase
      .from('frames')
      .upsert({
        id: frame.id,
        title: title || null,
        image_path: frame.image_path,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setMessage('Não foi possível salvar o nome do quadro.');
      setSavingTitleFrameId(null);
      return;
    }

    await loadFrames();
    setSavingTitleFrameId(null);
  }

  function handleFrameClick(frame: Frame) {
    if (frame.publicUrl) {
      setViewerImage({
        src: frame.publicUrl,
        frameId: frame.id,
      });
      return;
    }

    if (isAdmin) {
      fileInputsRef.current[frame.id]?.click();
    }
  }

  function handleChangeImage(frameId: number) {
    fileInputsRef.current[frameId]?.click();
  }

  async function handleFileChange(frameId: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !supabase || !isAdmin) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessage('Escolha um arquivo de imagem.');
      return;
    }

    setUploadingFrameId(frameId);
    setMessage(null);

    const currentFrame = frames.find((frame) => frame.id === frameId);
    const fileExtension = getFileExtension(file.name);
    const imagePath = `quadros/quadro-${frameId}-${Date.now()}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from(FRAMES_BUCKET)
      .upload(imagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      setMessage('Não foi possível enviar a imagem.');
      setUploadingFrameId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from('frames')
      .upsert({
        id: frameId,
        title: currentFrame?.title ?? null,
        image_path: imagePath,
        updated_at: new Date().toISOString(),
      });

    if (updateError) {
      await supabase.storage.from(FRAMES_BUCKET).remove([imagePath]);
      setMessage('A imagem foi enviada, mas não foi possível salvar o quadro.');
      setUploadingFrameId(null);
      return;
    }

    if (currentFrame?.image_path) {
      await supabase.storage.from(FRAMES_BUCKET).remove([currentFrame.image_path]);
    }

    await loadFrames();
    setUploadingFrameId(null);
  }

  async function handleRemoveImage(frame: Frame) {
    if (!supabase || !isAdmin || !frame.image_path) {
      return;
    }

    const confirmed = window.confirm(`Remover a imagem do quadro ${frame.id}?`);

    if (!confirmed) {
      return;
    }

    setRemovingFrameId(frame.id);
    setMessage(null);

    const { error: updateError } = await supabase
      .from('frames')
      .update({ image_path: null, updated_at: new Date().toISOString() })
      .eq('id', frame.id);

    if (updateError) {
      setMessage('Não foi possível remover a imagem do quadro.');
      setRemovingFrameId(null);
      return;
    }

    const { error: removeError } = await supabase.storage.from(FRAMES_BUCKET).remove([frame.image_path]);

    if (removeError) {
      setMessage('A imagem saiu do quadro, mas o arquivo antigo não foi removido do storage.');
    }

    await loadFrames();
    setRemovingFrameId(null);
  }

  return (
    <main className="app-shell">
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="intro__label">Galeria particular</p>
          <h1 id="page-title">Artes da Ket</h1>
          <p className="intro__text">
            Um cantinho simples para guardar desenhos favoritos em molduras digitais.
          </p>
        </div>
        <div className="intro__counter" aria-label={`${filledFramesCount} de ${FRAME_COUNT} quadros preenchidos`}>
          <strong>{filledFramesCount}</strong>
          <span>/ {FRAME_COUNT}</span>
        </div>
      </section>

      {message ? <p className="notice">{message}</p> : null}

      <section className="gallery" aria-label="Molduras com artes">
        {loading ? (
          <div className="loading-state">Carregando galeria...</div>
        ) : (
          rows.map((row, rowIndex) => (
            <div className="frame-row" key={rowIndex}>
              {row.map((frame) => (
                <article className="frame-card" key={frame.id}>
                  <div className="frame-heading">
                    {frame.title ? (
                      <h3>{frame.title}</h3>
                    ) : (
                      <span>{isAdmin ? 'Nome do quadro' : ''}</span>
                    )}
                  </div>

                  <button
                    className={`frame ${frame.publicUrl ? 'frame--filled' : ''}`}
                    type="button"
                    onClick={() => handleFrameClick(frame)}
                    aria-label={getFrameLabel(frame, isAdmin)}
                  >
                    {frame.publicUrl ? (
                      <img src={frame.publicUrl} alt={`Arte no quadro ${frame.id}`} />
                    ) : (
                      <span>
                        Quadro
                        <strong>{frame.id}</strong>
                      </span>
                    )}
                  </button>

                  {isAdmin ? (
                    <div className="frame-admin">
                      <div className="frame-title-form">
                        <input
                          type="text"
                          value={titleDrafts[frame.id] ?? ''}
                          onChange={(event) => handleTitleDraftChange(frame.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleSaveTitle(frame);
                            }
                          }}
                          maxLength={40}
                          placeholder="Nome da arte"
                          aria-label={`Nome do quadro ${frame.id}`}
                        />
                        <button
                          className="icon-action"
                          type="button"
                          onClick={() => handleSaveTitle(frame)}
                          disabled={savingTitleFrameId === frame.id}
                        >
                          {savingTitleFrameId === frame.id ? 'Salvando' : 'Salvar'}
                        </button>
                      </div>

                      <div className="frame-actions">
                        <button
                          className="icon-action"
                          type="button"
                          onClick={() => handleChangeImage(frame.id)}
                          disabled={uploadingFrameId === frame.id || removingFrameId === frame.id}
                        >
                          {frame.image_path ? 'Trocar' : 'Anexar'}
                        </button>
                        {frame.image_path ? (
                          <button
                            className="icon-action icon-action--danger"
                            type="button"
                            onClick={() => handleRemoveImage(frame)}
                            disabled={uploadingFrameId === frame.id || removingFrameId === frame.id}
                          >
                            {removingFrameId === frame.id ? 'Removendo' : 'Remover'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <input
                    ref={(element) => {
                      fileInputsRef.current[frame.id] = element;
                    }}
                    className="file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleFileChange(frame.id, event)}
                  />
                </article>
              ))}
            </div>
          ))
        )}
      </section>

      <section className="admin-panel" aria-labelledby="admin-title">
        <div>
          <p className="admin-panel__label">Área da Ket</p>
          <h2 id="admin-title">Editar galeria</h2>
        </div>

        {!session ? (
          <form className="login-form" onSubmit={handleLogin}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@exemplo.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Senha"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={authLoading}>
              {authLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : (
          <div className="admin-status">
            <p>
              Logado como <strong>{session.user.email}</strong>
            </p>
            {!isAdmin ? (
              <p className="admin-warning">Este e-mail não tem permissão para editar a galeria.</p>
            ) : (
              <p>Toque em uma moldura vazia para anexar ou use “Trocar” em uma moldura preenchida.</p>
            )}
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        )}
      </section>

      {viewerImage ? (
        <div className="viewer" role="dialog" aria-modal="true" aria-label={`Arte do quadro ${viewerImage.frameId}`}>
          <button className="viewer__backdrop" type="button" onClick={() => setViewerImage(null)} aria-label="Fechar" />
          <div className="viewer__content">
            <img src={viewerImage.src} alt={`Arte do quadro ${viewerImage.frameId} em tamanho inteiro`} />
            <button className="viewer__close" type="button" onClick={() => setViewerImage(null)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function createEmptyFrames(): Frame[] {
  return frameIds.map((id) => ({
    id,
    title: null,
    image_path: null,
    updated_at: null,
    publicUrl: null,
  }));
}

function mergeFrames(records: FrameRecord[]): Frame[] {
  const recordById = new Map(records.map((record) => [record.id, record]));

  return frameIds.map((id) => {
    const record = recordById.get(id);
    const imagePath = record?.image_path ?? null;

    return {
      id,
      title: record?.title ?? null,
      image_path: imagePath,
      updated_at: record?.updated_at ?? null,
      publicUrl: imagePath ? getPublicImageUrl(imagePath) : null,
    };
  });
}

function createTitleDrafts(frames: Frame[]) {
  return frames.reduce<Record<number, string>>((drafts, frame) => {
    drafts[frame.id] = frame.title ?? '';
    return drafts;
  }, {});
}

function getPublicImageUrl(path: string) {
  if (!supabase) {
    return null;
  }

  return supabase.storage.from(FRAMES_BUCKET).getPublicUrl(path).data.publicUrl;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && extension.length <= 5 ? extension : 'jpg';
}

function getFrameLabel(frame: Frame, isAdmin: boolean) {
  if (frame.publicUrl) {
    return `Abrir arte do quadro ${frame.id}`;
  }

  if (isAdmin) {
    return `Anexar imagem no quadro ${frame.id}`;
  }

  return `Quadro ${frame.id} vazio`;
}

export default App;
