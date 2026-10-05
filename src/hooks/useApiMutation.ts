import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { message } from 'antd';

/**
 * 乐观更新配置。
 *
 * 背景：原先新增一条记录后，用户要等 **POST + 再 GET 两个往返** 才能在列表里
 * 看到它（实测：每个请求 200ms 时，点「确定」到新行出现 781ms；真实 Supabase
 * 往返更慢，体感 1s 以上）。invalidate 本身没错，但它把「确认写入」和
 * 「看见写入」串行化了。
 *
 * 这里在 `onMutate`（请求发出**之前**）就把新行写进缓存，失败再回滚，
 * 成功后照旧 invalidate 用服务端数据校正。感知延迟从「一个往返」变成「立即」。
 */
export type Optimistic<TVariables> = {
  /**
   * 乐观写入哪些 queryKey 的缓存（前缀匹配，与 invalidateKeys 同口径）。
   *
   * ⚠️ 只列**行结构与新增实体一致**的 key。
   * 例如新增客户可以写 `['customers']`（客户行列表），
   * 但**不能**写 `['customers-select']` —— 那里存的是 `{value,label}` 选项对象，
   * 塞一行原始客户进去会让下拉框显示成乱码。
   *
   * ⚠️ 建议**精确到本页当前的 queryKey**（含筛选条件），不要只写前缀：
   * 前缀会连别的页面缓存一起命中（实测 `['customers']` 会命中 CustomerList 的
   * `['customers', search]`，而那个列表只显示已成交客户）。
   */
  keys: QueryKey[];
  /**
   * 由提交值造出一行。
   * ⚠️ **必须给一个临时 `id`**，否则列表的 rowKey 塌成 undefined，
   * React 会复用错节点、行内交互串味。
   */
  makeRow: (variables: TVariables) => Record<string, unknown>;
  /** 新行插到哪端。默认 'start'（列表按 created_at 倒序，新行在最上面）。 */
  position?: 'start' | 'end';
  /**
   * 逐条缓存判断「这条新行该不该写进这个缓存」。默认全写。
   *
   * ⚠️ **带筛选的列表必须给这个判定**，否则会显示一条本不该出现的行、等
   * invalidate 回来又凭空消失 —— 比「慢一点」更糟。实测踩到过：
   * 客户列表查询硬编码 `status='dealt'`，而新增表单 `status` 默认 `'new'`，
   * 于是**每一次新增都会先冒出一条「新线索」再消失**（默认路径，不是边缘场景）。
   *
   * 判定依据来自 queryKey（筛选条件通常就在 key 里）与 makeRow 造出的行。
   */
  accept?: (queryKey: QueryKey, row: Record<string, unknown>) => boolean;
};

type Options<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  successMsg?: string;
  invalidateKeys?: string[][];
  /** 只传「新增」路径；编辑路径不要传，否则会插入一条重复行。 */
  optimistic?: Optimistic<TVariables>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
};

type Ctx = { snapshots: Array<[QueryKey, unknown]> } | undefined;

export function useApiMutation<TData, TVariables>(
  options: Options<TData, TVariables>,
) {
  const queryClient = useQueryClient();
  const { successMsg, invalidateKeys, optimistic, onSuccess, onError, mutationFn } = options;

  return useMutation<TData, Error, TVariables, Ctx>({
    mutationFn,
    onMutate: optimistic
      ? async (variables: TVariables) => {
          const filters = optimistic.keys.map((k) => ({ queryKey: k }));
          // 取消进行中的请求：它们回来时会用「旧数据」把刚写进去的乐观行盖掉。
          await Promise.all(filters.map((f) => queryClient.cancelQueries(f)));

          const row = optimistic.makeRow(variables);
          const snapshots: Array<[QueryKey, unknown]> = [];
          const seen = new Set<string>();
          for (const f of filters) {
            // 用 getQueriesData 而不是 setQueriesData：后者的 updater 只拿到 old data，
            // **拿不到 queryKey**，就没法做上面的 accept 判定（筛选条件在 key 里）。
            for (const [key, old] of queryClient.getQueriesData(f)) {
              const id = JSON.stringify(key);
              if (seen.has(id)) continue; // 多个前缀可能命中同一个 query
              seen.add(id);
              if (optimistic.accept && !optimistic.accept(key, row)) continue;
              // 不是数组的缓存（或形状不符）不动它 —— 乐观更新宁可不做，也不能写坏。
              if (!Array.isArray(old)) continue;
              snapshots.push([key, old]);
              queryClient.setQueryData(
                key,
                optimistic.position === 'end' ? [...old, row] : [row, ...old],
              );
            }
          }
          return { snapshots };
        }
      : undefined,
    onSuccess: (data, variables) => {
      if (successMsg) message.success(successMsg);
      if (invalidateKeys) {
        invalidateKeys.forEach((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        );
      }
      onSuccess?.(data, variables);
    },
    onError: (error, variables, ctx) => {
      // 回滚到请求发出前的快照
      if (ctx) {
        for (const [key, snapshot] of ctx.snapshots) {
          queryClient.setQueryData(key, snapshot);
        }
      }
      message.error(error.message);
      onError?.(error, variables);
    },
  });
}
