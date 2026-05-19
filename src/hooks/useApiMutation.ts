import { useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';

type Options<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  successMsg?: string;
  invalidateKeys?: string[][];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
};

export function useApiMutation<TData, TVariables>(
  options: Options<TData, TVariables>,
) {
  const queryClient = useQueryClient();
  const { successMsg, invalidateKeys, onSuccess, onError, mutationFn } = options;

  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      if (successMsg) message.success(successMsg);
      if (invalidateKeys) {
        invalidateKeys.forEach((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        );
      }
      onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      message.error(error.message);
      onError?.(error, variables);
    },
  });
}
