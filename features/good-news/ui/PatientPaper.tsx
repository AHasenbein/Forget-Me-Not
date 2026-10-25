import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSession } from '@core/client/session';
import { AppText, BigButton, Card, Icon, ProgressDots } from '@core/design-system/components';
import { palette } from '@core/design-system/tokens';
import { buildPages, clampPage, dateLine, readProgress, type Page, type Paper } from './model';

const KEY = 'fmn.goodNews.progress';
const save = (v: object) =>
  void AsyncStorage.setItem(KEY, JSON.stringify(v)).catch(() => undefined);
const load = async () => {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null; // private window / blocked storage: just don't remember
  }
};

/**
 * Patient: today's paper. It opens by itself the first time each day (the first thing they see), one page at a time:
 * the caregiver's message, then gentle good news. Next is the one primary action; Back and Close are always there,
 * and closing remembers the page so "Read today's paper" continues where they stopped.
 */
export function PatientPaper() {
  const { api, token } = useSession();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    setPaper(null);
    setFailed(false);
    void api<Paper>('GET', '/api/good-news/paper')
      .then(async (p) => {
        if (!alive) return;
        const progress = readProgress(await load(), p.editionId);
        setPaper(p);
        setPage(clampPage(progress.page, buildPages(p).length));
        if (!progress.opened) {
          setOpen(true); // first look today: the paper comes first
          save({ ...progress, opened: true });
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const pages: Page[] = paper ? buildPages(paper) : [];
  const go = (n: number) => {
    const next = clampPage(n, pages.length);
    setPage(next);
    if (paper) save({ editionId: paper.editionId, page: next, opened: true });
  };
  const close = () => setOpen(false);
  /** Finished: next time it starts again from the first page. */
  const finish = () => {
    go(0);
    close();
  };

  if (failed)
    return (
      <Card>
        <AppText tone="muted">Today’s paper is not ready yet.</AppText>
      </Card>
    );
  if (!paper) return null;

  const last = page >= pages.length - 1;
  const current = pages[page]!;
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="flower" size={32} />
          <AppText variant="title">Today’s paper</AppText>
        </View>
        <BigButton
          tone="ghost"
          label={page > 0 ? 'Keep reading' : 'Read today’s paper'}
          onPress={() => setOpen(true)}
        />
      </Card>

      <Modal visible={open} animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: palette.bg }}>
          <View style={{ padding: 20, gap: 12, borderBottomWidth: 1, borderColor: palette.border }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flexShrink: 1 }}>
                <AppText variant="small" tone="muted">
                  {dateLine(paper.date)}
                </AppText>
                <AppText variant="title">The Morning Paper</AppText>
              </View>
              <View style={{ minWidth: 140 }}>
                <BigButton tone="ghost" label="Close" onPress={close} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ProgressDots done={page + 1} total={pages.length} />
              <AppText variant="small" tone="muted">
                Page {page + 1} of {pages.length}
              </AppText>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 24,
              gap: 20,
              maxWidth: 760,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <PageBody page={current} />
          </ScrollView>

          <View
            style={{
              padding: 20,
              gap: 12,
              borderTopWidth: 1,
              borderColor: palette.border,
              maxWidth: 760,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <BigButton
              label={last ? 'Finish reading' : 'Next page'}
              onPress={last ? finish : () => go(page + 1)}
            />
            {page > 0 ? <BigButton tone="ghost" label="Back" onPress={() => go(page - 1)} /> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

function PageBody({ page }: { page: Page }) {
  if (page.kind === 'message')
    return (
      <>
        <AppText variant="title" tone="primary">
          A message from your caregiver
        </AppText>
        <AppText variant="small" tone="muted">
          {page.when}
        </AppText>
        <AppText variant="huge">{page.text}</AppText>
      </>
    );
  if (page.kind === 'tip')
    return (
      <>
        <AppText variant="title" tone="primary">
          Money tip of the day
        </AppText>
        <AppText variant="huge">{page.text}</AppText>
      </>
    );
  if (page.kind === 'empty')
    return (
      <>
        <AppText variant="huge">No news today.</AppText>
        <AppText>Have a lovely day.</AppText>
      </>
    );
  return (
    <>
      <AppText variant="huge">{page.headline}</AppText>
      {page.summary ? <AppText>{page.summary}</AppText> : null}
      <AppText variant="small" tone="muted">
        From {page.source}
      </AppText>
    </>
  );
}
